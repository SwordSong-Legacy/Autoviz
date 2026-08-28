"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useWebSocket } from "./use-websocket";
import { useAuthStore } from "@/stores";
import { useLocalChatStore } from "@/stores/local-chat-store";
import { useApiChatStore } from "@/stores/api-chat-store";
import { conversationsApi } from "@/lib/api/conversations";
import { ApiError } from "@/lib/api-client";
import type {
  ChatMessage,
  ToolCall,
  WSEvent,
  PendingApproval,
  Decision,
  ProcessingStepsState,
  CsvSummaryData,
  PendingMcq,
  ChatThreadMessage,
  LiveVizChartForChat,
} from "@/types";
import { getAuthToken } from "@/lib/auth-token";
import { getImageUrl } from "@/lib/api-client";
import {
  formatVizTaskChatLine,
  issueFromWsVizTask,
  liveChartCriticHint,
  type LiveVizChartWithCritic,
  type VizPipelineIssue,
} from "@/lib/viz-critic";
import { WS_URL } from "@/lib/constants";
import { LLM_CONFIG_KEYS, DEFAULT_VISION_MODEL } from "@/lib/openrouter-models";
import { useLanguageStore } from "@/stores/lang-store";

type GeneratedVizToolPayload = {
  charts?: Array<{
    image_url?: string;
    title?: string;
    chart_type?: string;
    annotation?: string;
  }>;
};

function extractGeneratedVizCardsFromToolCalls(
  toolCalls:
    | Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
        result?: unknown;
        status: string;
      }>
    | null
    | undefined
): LiveVizChartForChat[] {
  if (!toolCalls?.length) return [];
  const cards: LiveVizChartForChat[] = [];
  for (const tc of toolCalls) {
    if (tc.name !== "generate_visualizations") continue;
    const result = (tc.result as GeneratedVizToolPayload | undefined) ?? {};
    const charts = result.charts ?? [];
    for (const c of charts) {
      if (!c.image_url) continue;
      cards.push({
        src: getImageUrl(c.image_url),
        title: c.title || c.chart_type || "Chart",
        type: c.chart_type,
        annotation: c.annotation,
      });
    }
  }
  return cards;
}

function useChatStore() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const localStore = useLocalChatStore();
  const apiStore = useApiChatStore();

  return isAuthenticated ? apiStore : localStore;
}

export function useLocalChat() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const store = useChatStore();

  const {
    currentConversationId,
    getCurrentMessages,
    createConversation,
    selectConversation,
    addMessage,
    updateMessage,
    addToolCall,
    updateToolCall,
    clearCurrentMessages,
    deleteConversation,
  } = store;

  const messages = getCurrentMessages();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const currentGroupIdRef = useRef<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [pendingMcq, setPendingMcq] = useState<PendingMcq | null>(null);

  const [processingSteps, setProcessingSteps] = useState<ProcessingStepsState>({
    dataUpload: "idle",
    dataCleaning: "idle",
    visualization: "idle",
  });
  const [featureEngEnabled, setFeatureEngEnabled] = useState(false);

  const [liveCsvSummary, setLiveCsvSummary] = useState<CsvSummaryData | null>(null);
  // Persists the CSV summary across MCQ cycles so it can be restored after
  // the MCQ round's 'complete' event clears the live state.
  const liveCsvSummaryRef = useRef<CsvSummaryData | null>(null);
  const [liveFeatureEngCsvSummary, setLiveFeatureEngCsvSummary] = useState<CsvSummaryData | null>(
    null
  );
  const [liveVizCharts, setLiveVizCharts] = useState<LiveVizChartWithCritic[]>([]);
  const [liveVizIssues, setLiveVizIssues] = useState<VizPipelineIssue[]>([]);

  // --- Multi-turn chat thread state ---
  const [chatMessages, setChatMessages] = useState<ChatThreadMessage[]>([]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const chatCurrentMessageIdRef = useRef<string | null>(null);
  const isChatTurnRef = useRef(false);
  // Accumulates raw assistant text synchronously during a chat turn.
  // Updated in chat_delta (sync ref write), read in complete — avoids React
  // state-update batching timing issues with chatMessagesRef.
  const chatAccumulatedTextRef = useRef<string>("");
  const chatGeneratedVizCardsRef = useRef<LiveVizChartForChat[]>([]);
  // New charts generated during chat turns (for Overview tab sync)
  const [chatVizCharts, setChatVizCharts] = useState<LiveVizChartForChat[]>([]);

  // API store: fetch conversations on mount, fetch messages when selecting
  useEffect(() => {
    if (!isAuthenticated) return;
    const apiStore = useApiChatStore.getState();
    apiStore.fetchConversations();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !currentConversationId) return;
    useApiChatStore.getState().fetchConversation(currentConversationId);
  }, [isAuthenticated, currentConversationId]);

  // Helper: load persisted chat-thread messages (with inline viz cards) from DB.
  // Skips the update if a chat turn is currently in progress.
  const loadChatMessagesFromDb = useCallback((convId: string, cancelled?: { current: boolean }) => {
    Promise.all([conversationsApi.get(convId), conversationsApi.listVisualizations(convId)])
      .then(([conv, vizItems]) => {
        if (cancelled?.current || isChatTurnRef.current) return;

        // Only chat-turn messages (group_id="chat")
        const rawMsgs = conv.messages.filter((m) => m.group_id === "chat");

        // Only done chat-viz records with a URL and created_at
        const chatViz = vizItems.filter(
          (v) => v.is_chat_viz && v.status === "done" && v.image_url && v.created_at
        );

        // Build chat messages; for each assistant message find viz records created before it
        // (and after the previous assistant message). Viz runs during tool call, so
        // created_at(viz) < created_at(assistant_msg).
        let prevAssistantTime = 0;
        const chatMsgs: ChatThreadMessage[] = rawMsgs.map((m) => {
          if (m.role !== "assistant")
            return {
              id: m.id,
              role: m.role as ChatThreadMessage["role"],
              content: m.content,
              isStreaming: false,
              vizCards: [],
            };

          const msgTime = new Date(m.created_at).getTime();
          const vizCards: typeof chatViz = chatViz.filter((v) => {
            const vt = new Date(v.created_at!).getTime();
            return vt > prevAssistantTime && vt < msgTime;
          });
          const toolVizCards = extractGeneratedVizCardsFromToolCalls(m.tool_calls);
          prevAssistantTime = msgTime;
          const merged = [
            ...vizCards.map((v) => ({
              src: getImageUrl(v.image_url!),
              title: (v.metadata?.title as string) || v.chart_type,
              type: v.chart_type,
              annotation: v.annotation ?? undefined,
            })),
            ...toolVizCards,
          ];
          const deduped = merged.filter(
            (card, idx, arr) => arr.findIndex((x) => x.src === card.src) === idx
          );

          return {
            id: m.id,
            role: "assistant" as const,
            content: m.content,
            isStreaming: false,
            vizCards: deduped,
          };
        });

        setChatMessages(chatMsgs);
      })
      .catch(() => {});
  }, []);

  // Load persisted chat-thread messages (with inline viz cards) from DB on conversation load.
  // Only runs if we're not in an active chat turn (avoids overwriting in-progress state).
  useEffect(() => {
    if (!isAuthenticated || !currentConversationId) return;
    const cancelled = { current: false };
    loadChatMessagesFromDb(currentConversationId, cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [isAuthenticated, currentConversationId, loadChatMessagesFromDb]);

  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      const wsEvent: WSEvent = JSON.parse(event.data);

      const createNewMessage = (content: string): string => {
        if (currentMessageId) {
          updateMessage(currentMessageId, (msg) => ({
            ...msg,
            isStreaming: false,
          }));
        }

        const newMsgId = nanoid();
        addMessage({
          id: newMsgId,
          role: "assistant",
          content,
          timestamp: new Date(),
          isStreaming: true,
          toolCalls: [],
          groupId: currentGroupIdRef.current || undefined,
        });
        setCurrentMessageId(newMsgId);
        return newMsgId;
      };

      switch (wsEvent.type) {
        case "model_request_start":
          createNewMessage("");
          break;

        case "start": {
          createNewMessage("🚀 Visualization process started...");
          // Don't downgrade dataUpload from "completed" — in the MCQ flow the
          // CSV was already processed before the questions were asked.
          setProcessingSteps((s) => ({
            ...s,
            dataUpload: s.dataUpload === "completed" ? "completed" : "loading",
          }));
          break;
        }

        case "csv_processing_start": {
          setProcessingSteps((s) => ({ ...s, dataUpload: "loading" }));
          if (currentMessageId) {
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + "\n\n📊 Processing CSV...",
            }));
          } else {
            createNewMessage("📊 Processing CSV...");
          }
          break;
        }

        case "csv_summary": {
          const summary = wsEvent.data as CsvSummaryData;
          setProcessingSteps((s) => ({
            ...s,
            dataUpload: summary.error ? "error" : "completed",
          }));
          if (!summary.error) {
            setLiveCsvSummary(summary);
            liveCsvSummaryRef.current = summary;
          }
          const content = summary.error
            ? `❌ CSV parse failed: ${summary.error}`
            : [
                `📊 **CSV parsing complete**`,
                "",
                `- **Rows:** ${summary.row_count.toLocaleString()}`,
                `- **Columns:** ${summary.column_count.toLocaleString()}`,
                summary.duplicate_rows_removed && summary.duplicate_rows_removed > 0
                  ? `- **Duplicate rows removed:** ${summary.duplicate_rows_removed.toLocaleString()}`
                  : "",
                summary.missing_values_handled
                  ? `\n**Missing values handled:**\n${summary.missing_values_handled}`
                  : "",
                "\n**Column types:**",
                ...Object.entries(summary.column_types).map(
                  ([col, dtype]) => `  - \`${col}\`: ${dtype}`
                ),
                summary.sample_rows
                  ? `\n\n**Sample data:**\n\`\`\`\n${summary.sample_rows}\n\`\`\``
                  : "",
              ]
                .filter(Boolean)
                .join("\n");
          if (currentMessageId) {
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content,
              isStreaming: true,
            }));
          } else {
            createNewMessage(content);
          }
          break;
        }

        case "feature_eng_start": {
          setProcessingSteps((s) => ({ ...s, dataCleaning: "loading" }));
          if (currentMessageId) {
            const { message } = wsEvent.data as { message: string };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n\n🔧 ${message}`,
            }));
          }
          break;
        }

        case "feature_eng_code": {
          if (currentMessageId) {
            const { code } = wsEvent.data as { code: string };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n\n**Generated code:**\n\`\`\`python\n${code}\n\`\`\``,
            }));
          }
          break;
        }

        case "feature_eng_stdout":
        case "feature_eng_stderr": {
          if (currentMessageId) {
            const { line } = wsEvent.data as { line: string };
            const prefix = wsEvent.type === "feature_eng_stderr" ? "⚠️ " : "";
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n${prefix}${line}`,
            }));
          }
          break;
        }

        case "feature_eng_csv_summary": {
          const summary = wsEvent.data as CsvSummaryData;
          if (!summary.error) setLiveFeatureEngCsvSummary(summary);
          const content = summary.error
            ? `❌ Enhanced CSV parse failed: ${summary.error}`
            : [
                `\n\n📊 **Enhanced dataframe summary**`,
                "",
                `- **Rows:** ${summary.row_count.toLocaleString()}`,
                `- **Columns:** ${summary.column_count.toLocaleString()}`,
                summary.duplicate_rows_removed && summary.duplicate_rows_removed > 0
                  ? `- **Duplicate rows removed:** ${summary.duplicate_rows_removed.toLocaleString()}`
                  : "",
                summary.missing_values_handled
                  ? `\n**Missing values handled:**\n${summary.missing_values_handled}`
                  : "",
                "\n**Column types:**",
                ...Object.entries(summary.column_types).map(
                  ([col, dtype]) => `  - \`${col}\`: ${dtype}`
                ),
                summary.sample_rows
                  ? `\n\n**Sample data:**\n\`\`\`\n${summary.sample_rows}\n\`\`\``
                  : "",
              ]
                .filter(Boolean)
                .join("\n");
          if (currentMessageId) {
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + content,
            }));
          }
          break;
        }

        case "feature_eng_result": {
          setProcessingSteps((s) => ({ ...s, dataCleaning: "completed" }));
          if (currentMessageId) {
            const { csv_content } = wsEvent.data as { csv_content: string };
            const lineCount = csv_content.split("\n").length;
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content:
                msg.content +
                `\n\n✅ **Feature engineering complete** – ${lineCount.toLocaleString()} rows in enhanced dataframe.`,
              isStreaming: true,
            }));
          }
          // Do NOT set isProcessing=false here — viz pipeline runs next; wait for "complete"
          break;
        }

        case "feature_eng_error": {
          setProcessingSteps((s) => ({ ...s, dataCleaning: "error" }));
          if (currentMessageId) {
            const { message } = wsEvent.data as { message: string };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n\n❌ **Feature engineering failed:** ${message}`,
              isStreaming: false,
            }));
          }
          setIsProcessing(false);
          setCurrentMessageId(null);
          break;
        }

        case "crew_start":
        case "crew_started":
          currentGroupIdRef.current = nanoid();
          break;

        case "text_delta": {
          if (currentMessageId) {
            const content = (wsEvent.data as { index: number; content: string }).content;
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + content,
            }));
          }
          break;
        }

        case "agent_started": {
          const { agent } = wsEvent.data as { agent: string; task: string };
          createNewMessage(`🤖 **${agent}** is starting...`);
          break;
        }

        case "agent_completed": {
          if (currentMessageId) {
            const { agent, output } = wsEvent.data as { agent: string; output: string };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: `✅ **${agent}**\n\n${output}`,
              isStreaming: false,
            }));
          }
          break;
        }

        case "task_started": {
          const { description, agent } = wsEvent.data as {
            task_id: string;
            description: string;
            agent: string;
          };
          createNewMessage(`📋 **Task** (${agent})\n\n${description}`);
          break;
        }

        case "task_completed": {
          if (currentMessageId) {
            const { output, agent } = wsEvent.data as {
              task_id: string;
              output: string;
              agent: string;
            };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: `✅ **Task completed** (${agent})\n\n${output}`,
              isStreaming: false,
            }));
          }
          break;
        }

        case "tool_started": {
          if (currentMessageId) {
            const { tool_name, tool_args, agent } = wsEvent.data as {
              tool_name: string;
              tool_args: string;
              agent: string;
            };
            const toolCall: ToolCall = {
              id: nanoid(),
              name: tool_name,
              args: { input: tool_args, agent },
              status: "running",
            };
            addToolCall(currentMessageId, toolCall);
          }
          break;
        }

        case "tool_finished": {
          if (currentMessageId) {
            const { tool_name, tool_result } = wsEvent.data as {
              tool_name: string;
              tool_result: string;
              agent: string;
            };
            updateMessage(currentMessageId, (msg) => {
              const toolCalls = msg.toolCalls || [];
              const lastToolCall = toolCalls.find(
                (tc) => tc.name === tool_name && tc.status === "running"
              );
              if (lastToolCall) {
                return {
                  ...msg,
                  toolCalls: toolCalls.map((tc) =>
                    tc.id === lastToolCall.id
                      ? { ...tc, result: tool_result, status: "completed" as const }
                      : tc
                  ),
                };
              }
              return msg;
            });
          }
          break;
        }

        case "llm_started":
        case "llm_completed":
          break;

        case "tool_call": {
          if (currentMessageId) {
            const { tool_name, args, tool_call_id } = wsEvent.data as {
              tool_name: string;
              args: Record<string, unknown>;
              tool_call_id: string;
            };
            const toolCall: ToolCall = {
              id: tool_call_id,
              name: tool_name,
              args,
              status: "running",
            };
            addToolCall(currentMessageId, toolCall);
          }
          break;
        }

        case "tool_result": {
          if (currentMessageId) {
            const { tool_call_id, content } = wsEvent.data as {
              tool_call_id: string;
              content: string;
            };
            updateToolCall(currentMessageId, tool_call_id, {
              result: content,
              status: "completed",
            });
          }
          break;
        }

        case "final_result": {
          if (currentMessageId) {
            const { output } = wsEvent.data as { output: string };
            if (output) {
              updateMessage(currentMessageId, (msg) => ({
                ...msg,
                content: msg.content || output,
                isStreaming: false,
              }));
            } else {
              updateMessage(currentMessageId, (msg) => ({
                ...msg,
                isStreaming: false,
              }));
            }
            if (output && useAuthStore.getState().isAuthenticated) {
              const convId = useApiChatStore.getState().currentConversationId;
              if (convId) {
                const msgs = useApiChatStore.getState().getCurrentMessages();
                const msg = msgs.find((m) => m.id === currentMessageId);
                if (msg) {
                  conversationsApi
                    .addMessage(convId, {
                      role: "assistant",
                      content: msg.content,
                      tool_calls: msg.toolCalls?.map((tc) => ({
                        id: tc.id,
                        name: tc.name,
                        args: tc.args,
                        result: tc.result,
                        status: tc.status,
                      })),
                    })
                    .catch(() => {});
                }
              }
            }
          }
          setIsProcessing(false);
          setCurrentMessageId(null);
          currentGroupIdRef.current = null;
          break;
        }

        case "error": {
          setPendingMcq(null);
          if (currentMessageId) {
            const { message } = wsEvent.data as { message: string };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n\n❌ Error: ${message || "Unknown error"}`,
              isStreaming: false,
            }));
          }
          setIsProcessing(false);
          setProcessingSteps({ dataUpload: "idle", dataCleaning: "idle", visualization: "idle" });
          // Also reset chat turn state if we're in a chat turn
          if (isChatTurnRef.current) {
            isChatTurnRef.current = false;
            setIsChatProcessing(false);
          }
          if (chatCurrentMessageIdRef.current) {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === chatCurrentMessageIdRef.current ? { ...m, isStreaming: false } : m
              )
            );
            chatCurrentMessageIdRef.current = null;
          }
          break;
        }

        case "viz_start": {
          setProcessingSteps((s) => ({ ...s, visualization: "loading" }));
          if (currentMessageId) {
            const { message } = (wsEvent.data as { message: string }) ?? {};
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content:
                msg.content +
                (message ? `\n\n📊 ${message}` : "\n\n📊 Visualization pipeline started..."),
            }));
          }
          break;
        }

        case "viz_turn_start": {
          if (currentMessageId) {
            const { turn, total_turns, message } =
              (wsEvent.data as { turn: number; total_turns: number; message: string }) ?? {};
            const text =
              message ??
              (turn != null && total_turns != null
                ? `Starting visualization turn ${turn}/${total_turns}`
                : "Visualization in progress...");
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n\n📈 ${text}`,
            }));
          }
          break;
        }

        case "chat_start": {
          isChatTurnRef.current = true;
          chatAccumulatedTextRef.current = ""; // reset accumulator for new turn
          chatGeneratedVizCardsRef.current = [];
          const msgId = nanoid();
          chatCurrentMessageIdRef.current = msgId;
          setChatMessages((prev) => [
            ...prev,
            { id: msgId, role: "assistant" as const, content: "", isStreaming: true, vizCards: [] },
          ]);
          break;
        }

        case "chat_delta": {
          const { content } = wsEvent.data as { content: string };
          chatAccumulatedTextRef.current += content; // sync write — no React batching delay
          const msgId = chatCurrentMessageIdRef.current;
          if (msgId) {
            setChatMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, content: m.content + content } : m))
            );
          }
          break;
        }

        case "chat_viz_trigger": {
          // Agent called generate_visualizations — show progress in the chat message
          const { focus } = wsEvent.data as { focus: string; num_charts: number };
          const chatMsgId = chatCurrentMessageIdRef.current;
          if (chatMsgId) {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === chatMsgId
                  ? {
                      ...m,
                      content: m.content
                        ? m.content + `\n\n📊 Generating visualizations focused on: *${focus}*...`
                        : `📊 Generating visualizations focused on: *${focus}*...`,
                    }
                  : m
              )
            );
          }
          break;
        }

        case "viz_task_complete": {
          const d = wsEvent.data as {
            task_id?: string;
            chart_type?: string;
            features?: string[];
            status?: string;
            image_path?: string | null;
            metadata?: Record<string, unknown>;
            annotation?: string;
            error?: string | null;
          };
          const md = d.metadata ?? {};
          if (d?.image_path) {
            setLiveVizCharts((prev) => [
              ...prev,
              {
                src: getImageUrl(d.image_path!),
                title: (md.title as string) || d.chart_type || "Chart",
                type: d.chart_type ?? "chart",
                features: Array.isArray(d.features) ? d.features : [],
                annotation:
                  (d.annotation as string) ||
                  (md.annotation as string) ||
                  (md.description as string),
                criticHint: liveChartCriticHint(md),
              },
            ]);
            // In chat mode, also attach to current chat message
            if (isChatTurnRef.current) {
              if (chatGeneratedVizCardsRef.current.length >= 1) {
                break;
              }
              const chatCard: LiveVizChartForChat = {
                src: getImageUrl(d.image_path!),
                title: (md.title as string) || d.chart_type || "Chart",
                type: d.chart_type,
                annotation: (d.annotation as string) || (md.annotation as string),
              };
              chatGeneratedVizCardsRef.current = [chatCard];
              setChatVizCharts((prev) => [...prev, chatCard]);
              const chatMsgId = chatCurrentMessageIdRef.current;
              if (chatMsgId) {
                setChatMessages((prev) =>
                  prev.map((m) => (m.id === chatMsgId ? { ...m, vizCards: [chatCard] } : m))
                );
              }
            }
          }
          const issue = issueFromWsVizTask({
            task_id: d.task_id,
            chart_type: d.chart_type,
            features: d.features,
            status: d.status,
            metadata: d.metadata,
            error: d.error,
          });
          if (issue) {
            setLiveVizIssues((prev) => [...prev, issue]);
          }
          if (currentMessageId) {
            const line = formatVizTaskChatLine(d.status, d.chart_type, d.metadata ?? null, d.error);
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: `${msg.content}\n${line}`,
            }));
          }
          break;
        }

        case "viz_complete": {
          setProcessingSteps((s) => ({ ...s, visualization: "completed" }));
          if (currentMessageId) {
            const { message } = (wsEvent.data as { message?: string }) ?? {};
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content:
                msg.content + (message ? `\n\n✅ ${message}` : "\n\n✅ Visualization complete."),
            }));
          }
          break;
        }

        case "viz_error": {
          setProcessingSteps((s) => ({ ...s, visualization: "error" }));
          if (currentMessageId) {
            const { message } = (wsEvent.data as { message?: string }) ?? {};
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n\n❌ Visualization failed: ${message ?? "Unknown error"}`,
              isStreaming: false,
            }));
          }
          break;
        }

        case "mcq_question": {
          const { question, options } = wsEvent.data as { question: string; options: string[] };
          setPendingMcq({ question, options });
          break;
        }

        case "tool_approval_required": {
          const { action_requests, review_configs } = wsEvent.data as {
            action_requests: Array<{
              id: string;
              tool_name: string;
              args: Record<string, unknown>;
            }>;
            review_configs: Array<{
              tool_name: string;
              allow_edit?: boolean;
              timeout?: number;
            }>;
          };
          setPendingApproval({
            actionRequests: action_requests,
            reviewConfigs: review_configs,
          });
          if (currentMessageId) {
            const toolNames = action_requests.map((ar) => ar.tool_name).join(", ");
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: msg.content + `\n\n⏸️ Waiting for approval: ${toolNames}`,
            }));
          }
          break;
        }

        case "complete": {
          // Capture accumulated text BEFORE any state/ref resets
          const assistantContent = chatAccumulatedTextRef.current.trim();
          chatAccumulatedTextRef.current = ""; // reset for next turn

          // Finalize any streaming chat message
          if (chatCurrentMessageIdRef.current) {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === chatCurrentMessageIdRef.current ? { ...m, isStreaming: false } : m
              )
            );
            chatCurrentMessageIdRef.current = null;
          }

          if (isChatTurnRef.current) {
            // Chat turn complete — don't clear pipeline state or live viz charts
            isChatTurnRef.current = false;
            setIsChatProcessing(false);
            // Persist assistant message to DB via REST, then reload chat thread from DB.
            // assistantContent comes from chatAccumulatedTextRef (sync ref, no React batching issues).
            if (useAuthStore.getState().isAuthenticated) {
              const convId = useApiChatStore.getState().currentConversationId;
              if (convId) {
                const generatedVizToolCalls = chatGeneratedVizCardsRef.current.length
                  ? [
                      {
                        id: nanoid(),
                        name: "generate_visualizations",
                        args: { source: "chat_viz_task_complete_events" },
                        result: {
                          charts: chatGeneratedVizCardsRef.current.map((card) => ({
                            image_url: card.src,
                            title: card.title,
                            chart_type: card.type,
                            annotation: card.annotation,
                          })),
                        },
                        status: "completed",
                      },
                    ]
                  : undefined;
                if (assistantContent) {
                  conversationsApi
                    .addMessage(convId, {
                      role: "assistant",
                      content: assistantContent,
                      group_id: "chat",
                      tool_calls: generatedVizToolCalls,
                    })
                    .then(() => {
                      chatGeneratedVizCardsRef.current = [];
                      loadChatMessagesFromDb(convId);
                    })
                    .catch(() => {});
                } else {
                  chatGeneratedVizCardsRef.current = [];
                  loadChatMessagesFromDb(convId);
                }
              }
            }
          } else {
            // Pipeline turn complete — existing cleanup
            if (currentMessageId) {
              updateMessage(currentMessageId, (msg) => ({ ...msg, isStreaming: false }));
            }
            setIsProcessing(false);
            setCurrentMessageId(null);
            setProcessingSteps({ dataUpload: "idle", dataCleaning: "idle", visualization: "idle" });
            setLiveCsvSummary(null);
            setLiveFeatureEngCsvSummary(null);
            setLiveVizCharts([]);
            setLiveVizIssues([]);
            if (useAuthStore.getState().isAuthenticated) {
              const convId = useApiChatStore.getState().currentConversationId;
              if (convId) {
                useApiChatStore
                  .getState()
                  .fetchConversation(convId)
                  .catch(() => {});
              }
              useApiChatStore
                .getState()
                .fetchConversations()
                .catch(() => {});
            }
          }
          break;
        }
      }
    },
    [
      currentMessageId,
      addMessage,
      updateMessage,
      addToolCall,
      updateToolCall,
      loadChatMessagesFromDb,
    ]
  );

  const token = getAuthToken();
  const wsUrl = `${WS_URL}/api/v1/ws/agent${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  const { isConnected, connect, disconnect, sendMessage } = useWebSocket({
    url: wsUrl,
    onMessage: handleWebSocketMessage,
  });

  const sendChatMessage = useCallback(
    async (
      content: string,
      csvFile?: File,
      dataUrl?: string,
      runFeatureEngineering = false
    ): Promise<string | null> => {
      let convId: string | null;
      // CSV upload always creates a new conversation so each analysis is independent
      if (csvFile || dataUrl) {
        convId = await createConversation();
      } else {
        convId = currentConversationId;
        if (!convId) {
          convId = await createConversation();
        }
      }

      const displayContent = csvFile
        ? `${content}${content ? "\n\n" : ""}📎 ${csvFile.name}`
        : dataUrl
          ? `${content}${content ? "\n\n" : ""}🔗 ${dataUrl}`
          : content;

      const userMessage: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: displayContent,
        timestamp: new Date(),
      };
      addMessage(userMessage);

      let csvContent: string | undefined;
      let uploadFilename: string | undefined;
      let urlImportError: string | null = null;
      if (csvFile) {
        try {
          csvContent = await csvFile.text();
          uploadFilename = csvFile.name;
        } catch {
          // Fallback: send without CSV if read fails
        }
      }
      if (dataUrl && convId) {
        try {
          const stored = await conversationsApi.addMessageWithUrl(convId, content, dataUrl);
          csvContent = stored.csv_content ?? undefined;
          uploadFilename = stored.csv_filename ?? "source.json";
        } catch (err) {
          if (err instanceof ApiError) {
            urlImportError = err.message;
          } else if (err instanceof Error) {
            urlImportError = err.message;
          } else {
            urlImportError = "URL import failed.";
          }
        }
      }
      if (dataUrl && !csvContent) {
        if (convId) {
          // URL import did not produce usable CSV; clean up the empty conversation.
          await Promise.resolve(deleteConversation(convId)).catch(() => {});
        }
        throw new Error(
          urlImportError ?? "URL import failed. Please provide a public URL that returns JSON data."
        );
      }

      if (isAuthenticated && convId) {
        if (csvFile && csvContent !== undefined) {
          conversationsApi.addMessageWithCsv(convId, content, csvFile).catch(() => {});
        } else if (dataUrl) {
          // Already persisted above to retrieve normalized CSV content.
        } else {
          conversationsApi.addMessage(convId, { role: "user", content }).catch(() => {});
        }
      }

      setIsProcessing(true);
      if (csvContent) {
        setFeatureEngEnabled(runFeatureEngineering);
        setProcessingSteps({
          dataUpload: "loading",
          dataCleaning: "idle",
          visualization: "idle",
        });
        setLiveCsvSummary(null);
        liveCsvSummaryRef.current = null;
        setLiveFeatureEngCsvSummary(null);
        setLiveVizCharts([]);
        setLiveVizIssues([]);
      }
      const llmApiKey =
        typeof window !== "undefined" ? localStorage.getItem(LLM_CONFIG_KEYS.API_KEY) : null;
      const llmModel =
        typeof window !== "undefined"
          ? localStorage.getItem(LLM_CONFIG_KEYS.MODEL) || DEFAULT_VISION_MODEL
          : DEFAULT_VISION_MODEL;
      const currentLang = useLanguageStore.getState().lang;
      const basePayload: Record<string, unknown> = {
        message: content,
        conversation_id: convId ?? undefined,
        language: currentLang,
      };
      if (llmApiKey) {
        basePayload.openrouter_api_key = llmApiKey;
        basePayload.ai_model = llmModel;
      }
      sendMessage(
        csvContent
          ? {
              ...basePayload,
              csv_content: csvContent,
              upload_filename: uploadFilename,
              run_feature_engineering: runFeatureEngineering,
            }
          : basePayload
      );
      return convId;
    },
    [addMessage, sendMessage, currentConversationId, createConversation, isAuthenticated]
  );

  const startNewChat = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  const handleClearMessages = useCallback(async () => {
    await clearCurrentMessages();
  }, [clearCurrentMessages]);

  const sendMcqAnswer = useCallback(
    (answer: string | null) => {
      setPendingMcq(null);
      // Optimistically re-enter processing so the live pipeline view appears
      // immediately when the backend starts the viz pipeline.
      setIsProcessing(true);
      // The CSV was already uploaded & processed before the MCQ questions,
      // so Data Upload is already done. Restore the summary that was cleared
      // by the MCQ round's 'complete' event.
      if (liveCsvSummaryRef.current) {
        setLiveCsvSummary(liveCsvSummaryRef.current);
      }
      setProcessingSteps({ dataUpload: "completed", dataCleaning: "idle", visualization: "idle" });
      setLiveVizCharts([]);
      setLiveVizIssues([]);
      sendMessage({ type: "mcq_answer", answer });
    },
    [sendMessage]
  );

  const sendMultiTurnMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isChatProcessing) return;
      if (!isAuthenticated) return; // guest chat not supported

      const convId = currentConversationId;
      if (!convId) return; // no active conversation

      const userMsg: ChatThreadMessage = {
        id: nanoid(),
        role: "user",
        content: text,
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setIsChatProcessing(true);

      // Persist user message to DB immediately (same pattern as CSV upload path)
      conversationsApi
        .addMessage(convId, { role: "user", content: text, group_id: "chat" })
        .catch(() => {});

      // Send last 20 messages as history (client-side context window limit)
      const history = chatMessages
        .slice(-20)
        .map((m) => ({ role: m.role as string, content: m.content }));

      const llmApiKey =
        typeof window !== "undefined" ? localStorage.getItem(LLM_CONFIG_KEYS.API_KEY) : null;
      const llmModel =
        typeof window !== "undefined"
          ? localStorage.getItem(LLM_CONFIG_KEYS.MODEL) || DEFAULT_VISION_MODEL
          : DEFAULT_VISION_MODEL;

      const payload: Record<string, unknown> = {
        message: text,
        conversation_id: convId,
        history,
        language: useLanguageStore.getState().lang,
      };
      if (llmApiKey) {
        payload.openrouter_api_key = llmApiKey;
        payload.ai_model = llmModel;
      }

      sendMessage(payload);
    },
    [chatMessages, currentConversationId, isChatProcessing, isAuthenticated, sendMessage]
  );

  const sendResumeDecisions = useCallback(
    (decisions: Decision[]) => {
      setPendingApproval(null);

      if (currentMessageId) {
        const approvedCount = decisions.filter((d) => d.type === "approve").length;
        const editedCount = decisions.filter((d) => d.type === "edit").length;
        const rejectedCount = decisions.filter((d) => d.type === "reject").length;

        const summaryParts: string[] = [];
        if (approvedCount > 0) summaryParts.push(`${approvedCount} approved`);
        if (editedCount > 0) summaryParts.push(`${editedCount} edited`);
        if (rejectedCount > 0) summaryParts.push(`${rejectedCount} rejected`);

        updateMessage(currentMessageId, (msg) => ({
          ...msg,
          content: msg.content.replace(
            /\n\n⏸️ Waiting for approval:.*$/,
            `\n\n✅ Decisions: ${summaryParts.join(", ")}`
          ),
        }));
      }

      sendMessage({
        type: "resume",
        decisions: decisions.map((d) => {
          if (d.type === "edit" && d.editedAction) {
            return {
              type: "edit",
              edited_action: d.editedAction,
            };
          }
          return { type: d.type };
        }),
      });
    },
    [currentMessageId, updateMessage, sendMessage]
  );

  return {
    messages,
    currentConversationId,
    isConnected,
    isProcessing,
    processingSteps,
    featureEngEnabled,
    liveCsvSummary,
    liveFeatureEngCsvSummary,
    liveVizCharts,
    liveVizIssues,
    connect,
    disconnect,
    selectConversation,
    sendMessage: sendChatMessage,
    clearMessages: handleClearMessages,
    startNewChat,
    pendingApproval,
    sendResumeDecisions,
    pendingMcq,
    sendMcqAnswer,
    chatMessages,
    isChatProcessing,
    chatVizCharts,
    sendMultiTurnMessage,
  };
}
