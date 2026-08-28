"use client";

import { useState } from "react";
import { useChatContext } from "@/contexts/chat-context";
import { ProcessingSteps } from "./processing-steps";
import { AnalysisOverviewLive } from "@/components/analysis/analysis-overview-live";
import { McqCard } from "./mcq-card";
import { MessageThread } from "./message-thread";
import { LayoutGrid, List, MessageSquare } from "lucide-react";
import { useAuthStore } from "@/stores";
import { useLang } from "@/hooks";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isConversationId(id: string): boolean {
  return UUID_REGEX.test(id);
}

interface ChatContainerProps {
  analysisId?: string | null;
}

type ViewMode = "overview" | "steps" | "chat";

export function ChatContainer({ analysisId }: ChatContainerProps) {
  const { t } = useLang();
  const {
    isProcessing,
    processingSteps,
    featureEngEnabled,
    liveCsvSummary,
    liveFeatureEngCsvSummary,
    liveVizCharts,
    liveVizIssues,
    currentConversationId,
    pendingMcq,
    sendMcqAnswer,
    chatMessages,
    isChatProcessing,
    chatVizCharts,
  } = useChatContext();

  const { isAuthenticated } = useAuthStore();

  const effectiveAnalysisId = analysisId ?? currentConversationId ?? null;

  const [viewMode, setViewMode] = useState<ViewMode>("overview");

  // Reset to overview if user is not authenticated
  const effectiveViewMode = isAuthenticated
    ? viewMode
    : viewMode === "chat"
      ? "overview"
      : viewMode;

  const showAnalysisResult =
    effectiveAnalysisId && (isProcessing ? true : isConversationId(effectiveAnalysisId));

  // Convert chatVizCharts to LiveVizChart shape for AnalysisOverviewLive
  const additionalCharts = chatVizCharts.map((c) => ({
    src: c.src,
    title: c.title,
    type: c.type ?? "chart",
    annotation: c.annotation,
  }));

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {showAnalysisResult && (
        <div className="border-border bg-surface flex shrink-0 items-center justify-end gap-1 border-b px-4 py-2">
          <span className="text-muted mr-2 font-mono text-[9px] tracking-widest uppercase">
            {t.chat.viewLabel}
          </span>
          <button
            type="button"
            onClick={() => setViewMode("overview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors ${
              effectiveViewMode === "overview"
                ? "bg-foreground text-background"
                : "text-muted hover:bg-secondary hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {t.chat.viewOverview}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("steps")}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors ${
              effectiveViewMode === "steps"
                ? "bg-foreground text-background"
                : "text-muted hover:bg-secondary hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            {t.chat.viewPipeline}
          </button>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setViewMode("chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors ${
                effectiveViewMode === "chat"
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t.chat.viewChat}
              {chatMessages.length > 0 && (
                <span className="bg-accent text-accent-foreground ml-1 flex h-4 w-4 items-center justify-center rounded-full font-mono text-[8px]">
                  {chatMessages.length > 9 ? "9+" : chatMessages.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-4 sm:py-6">
        {pendingMcq ? (
          <div className="flex justify-center pt-8">
            <McqCard
              question={pendingMcq.question}
              options={pendingMcq.options}
              onAnswer={sendMcqAnswer}
            />
          </div>
        ) : effectiveViewMode === "chat" && showAnalysisResult ? (
          <MessageThread messages={chatMessages} isProcessing={isChatProcessing} />
        ) : isProcessing && showAnalysisResult ? (
          <AnalysisOverviewLive
            analysisId={effectiveAnalysisId}
            isProcessing={true}
            processingSteps={processingSteps}
            featureEngEnabled={featureEngEnabled}
            liveCsvSummary={liveCsvSummary}
            liveFeatureEngCsvSummary={liveFeatureEngCsvSummary}
            liveVizCharts={liveVizCharts}
            liveVizIssues={liveVizIssues}
            additionalCharts={additionalCharts}
          />
        ) : isProcessing ? (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-muted font-mono text-xs tracking-widest uppercase">
              Processing your data...
            </p>
          </div>
        ) : showAnalysisResult ? (
          effectiveViewMode === "overview" ? (
            <AnalysisOverviewLive
              analysisId={effectiveAnalysisId}
              additionalCharts={additionalCharts}
            />
          ) : (
            <ProcessingSteps analysisId={effectiveAnalysisId} />
          )
        ) : (
          <ProcessingSteps analysisId={effectiveAnalysisId} />
        )}
      </div>
    </div>
  );
}
