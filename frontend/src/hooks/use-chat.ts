"use client";

import { useCallback, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useWebSocket } from "./use-websocket";
import { useChatStore } from "@/stores";
import type { ChatMessage, WSEvent, PendingApproval, Decision, CsvSummaryData } from "@/types";
import { WS_URL } from "@/lib/constants";
import { useLanguageStore } from "@/stores/lang-store";

/** Format CSV summary to markdown. Shared by csv_summary and feature_eng_csv_summary. */
function formatCsvSummary(
  summary: CsvSummaryData,
  opts?: { errorPrefix?: string; title?: string }
) {
  const { errorPrefix = "CSV parse failed", title = "📊 **CSV parsing complete**" } = opts ?? {};
  if (summary.error) return `❌ ${errorPrefix}: ${summary.error}`;
  return [
    title,
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
    ...Object.entries(summary.column_types).map(([col, dtype]) => `  - \`${col}\`: ${dtype}`),
    summary.sample_rows ? `\n\n**Sample data:**\n\`\`\`\n${summary.sample_rows}\n\`\`\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
export function useChat() {
  const { messages, addMessage, updateMessage, addToolCall, updateToolCall, clearMessages } =
    useChatStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  // Use ref for groupId to avoid React state timing issues with rapid WebSocket events
  const currentGroupIdRef = useRef<string | null>(null);
  // Human-in-the-Loop: pending tool approval state
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const handleWebSocketMessage = useCallback(
    (event: MessageEvent) => {
      const wsEvent: WSEvent = JSON.parse(event.data);

      // --- Helpers (closed over currentMessageId, updateMessage, addMessage, etc.) ---
      const createNewMessage = (content: string): string => {
        if (currentMessageId) {
          updateMessage(currentMessageId, (msg) => ({ ...msg, isStreaming: false }));
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

      const appendOrCreate = (content: string) => {
        if (currentMessageId) {
          updateMessage(currentMessageId, (msg) => ({
            ...msg,
            content: msg.content + content,
            isStreaming: true,
          }));
        } else {
          createNewMessage(content);
        }
      };

      const replaceOrCreate = (content: string) => {
        if (currentMessageId) {
          updateMessage(currentMessageId, (msg) => ({ ...msg, content, isStreaming: true }));
        } else {
          createNewMessage(content);
        }
      };

      const appendToCurrent = (content: string) => {
        if (currentMessageId) {
          updateMessage(currentMessageId, (msg) => ({ ...msg, content: msg.content + content }));
        }
      };

      const finalizeProcessing = () => {
        setIsProcessing(false);
        setCurrentMessageId(null);
      };

      // --- Event dispatch ---
      switch (wsEvent.type) {
        case "model_request_start":
          createNewMessage("");
          break;

        case "start":
          createNewMessage("🚀 Visualization process started...");
          break;

        case "csv_processing_start":
          appendOrCreate("\n\n📊 Processing CSV...");
          break;

        case "csv_summary":
          replaceOrCreate(formatCsvSummary(wsEvent.data as CsvSummaryData));
          break;

        case "feature_eng_start":
          appendToCurrent(`\n\n🔧 ${(wsEvent.data as { message: string }).message}`);
          break;

        case "feature_eng_code":
          appendToCurrent(
            `\n\n**Generated code:**\n\`\`\`python\n${(wsEvent.data as { code: string }).code}\n\`\`\``
          );
          break;

        case "feature_eng_stdout":
        case "feature_eng_stderr": {
          const prefix = wsEvent.type === "feature_eng_stderr" ? "⚠️ " : "";
          appendToCurrent(`\n${prefix}${(wsEvent.data as { line: string }).line}`);
          break;
        }

        case "feature_eng_csv_summary":
          appendToCurrent(
            formatCsvSummary(wsEvent.data as CsvSummaryData, {
              errorPrefix: "Enhanced CSV parse failed",
              title: "\n\n📊 **Enhanced dataframe summary**",
            })
          );
          break;

        case "feature_eng_result":
          appendToCurrent(
            `\n\n✅ **Feature engineering complete** – ${(wsEvent.data as { csv_content: string }).csv_content.split("\n").length.toLocaleString()} rows in enhanced dataframe.`
          );
          if (currentMessageId) {
            updateMessage(currentMessageId, (msg) => ({ ...msg, isStreaming: false }));
          }
          finalizeProcessing();
          break;

        case "feature_eng_error":
          appendToCurrent(
            `\n\n❌ **Feature engineering failed:** ${(wsEvent.data as { message: string }).message}`
          );
          if (currentMessageId) {
            updateMessage(currentMessageId, (msg) => ({ ...msg, isStreaming: false }));
          }
          finalizeProcessing();
          break;

        case "crew_start":
        case "crew_started":
          currentGroupIdRef.current = nanoid();
          break;

        case "text_delta":
          appendToCurrent((wsEvent.data as { content: string }).content);
          break;

        case "agent_started": {
          const { agent } = wsEvent.data as { agent: string; task: string };
          createNewMessage(`🤖 **${agent}** is starting...`);
          break;
        }

        case "agent_completed":
          if (currentMessageId) {
            const { agent, output } = wsEvent.data as { agent: string; output: string };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: `✅ **${agent}**\n\n${output}`,
              isStreaming: false,
            }));
          }
          break;

        case "task_started": {
          const { description, agent } = wsEvent.data as {
            task_id: string;
            description: string;
            agent: string;
          };
          createNewMessage(`📋 **Task** (${agent})\n\n${description}`);
          break;
        }

        case "task_completed":
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

        case "tool_started":
          if (currentMessageId) {
            const { tool_name, tool_args, agent } = wsEvent.data as {
              tool_name: string;
              tool_args: string;
              agent: string;
            };
            addToolCall(currentMessageId, {
              id: nanoid(),
              name: tool_name,
              args: { input: tool_args, agent },
              status: "running",
            });
          }
          break;

        case "tool_finished":
          if (currentMessageId) {
            const { tool_name, tool_result } = wsEvent.data as {
              tool_name: string;
              tool_result: string;
              agent: string;
            };
            updateMessage(currentMessageId, (msg) => {
              const toolCalls = msg.toolCalls || [];
              const last = toolCalls.find((tc) => tc.name === tool_name && tc.status === "running");
              if (!last) return msg;
              return {
                ...msg,
                toolCalls: toolCalls.map((tc) =>
                  tc.id === last.id
                    ? { ...tc, result: tool_result, status: "completed" as const }
                    : tc
                ),
              };
            });
          }
          break;

        case "llm_started":
        case "llm_completed":
          break;

        case "tool_call":
          if (currentMessageId) {
            const { tool_name, args, tool_call_id } = wsEvent.data as {
              tool_name: string;
              args: Record<string, unknown>;
              tool_call_id: string;
            };
            addToolCall(currentMessageId, {
              id: tool_call_id,
              name: tool_name,
              args,
              status: "running",
            });
          }
          break;

        case "tool_result":
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

        case "final_result":
          if (currentMessageId) {
            const { output } = wsEvent.data as { output: string };
            updateMessage(currentMessageId, (msg) => ({
              ...msg,
              content: output ? msg.content || output : msg.content,
              isStreaming: false,
            }));
          }
          finalizeProcessing();
          currentGroupIdRef.current = null;
          break;

        case "error":
          appendToCurrent(
            `\n\n❌ Error: ${(wsEvent.data as { message?: string })?.message || "Unknown error"}`
          );
          if (currentMessageId) {
            updateMessage(currentMessageId, (msg) => ({ ...msg, isStreaming: false }));
          }
          setIsProcessing(false);
          break;

        case "tool_approval_required": {
          const { action_requests, review_configs } = wsEvent.data as {
            action_requests: Array<{
              id: string;
              tool_name: string;
              args: Record<string, unknown>;
            }>;
            review_configs: Array<{ tool_name: string; allow_edit?: boolean; timeout?: number }>;
          };
          setPendingApproval({ actionRequests: action_requests, reviewConfigs: review_configs });
          appendToCurrent(
            `\n\n⏸️ Waiting for approval: ${action_requests.map((ar) => ar.tool_name).join(", ")}`
          );
          break;
        }

        case "complete":
          if (currentMessageId) {
            updateMessage(currentMessageId, (msg) => ({ ...msg, isStreaming: false }));
          }
          finalizeProcessing();
          break;
      }
    },
    [currentMessageId, addMessage, updateMessage, addToolCall, updateToolCall]
  );

  const wsUrl = `${WS_URL}/api/v1/ws/agent`;

  const { isConnected, connect, disconnect, sendMessage } = useWebSocket({
    url: wsUrl,
    onMessage: handleWebSocketMessage,
  });

  const sendChatMessage = useCallback(
    (content: string) => {
      // Add user message
      const userMessage: ChatMessage = {
        id: nanoid(),
        role: "user",
        content,
        timestamp: new Date(),
      };
      addMessage(userMessage);

      // Send to WebSocket
      setIsProcessing(true);
      sendMessage({ message: content, language: useLanguageStore.getState().lang });
    },
    [addMessage, sendMessage]
  );

  // Human-in-the-Loop: send resume message with user decisions
  const sendResumeDecisions = useCallback(
    (decisions: Decision[]) => {
      // Clear pending approval state
      setPendingApproval(null);

      // Update message to show decisions were made
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

      // Send resume message to WebSocket
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
    isConnected,
    isProcessing,
    connect,
    disconnect,
    sendMessage: sendChatMessage,
    clearMessages,
    // Human-in-the-Loop support
    pendingApproval,
    sendResumeDecisions,
  };
}
