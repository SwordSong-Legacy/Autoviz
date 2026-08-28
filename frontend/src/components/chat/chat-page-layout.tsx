"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatContainer } from "@/components/chat";
import { ChatDock } from "@/components/chat/chat-dock";
import { UploadZone } from "@/components/analysis/upload-zone";
import { RecentAnalysesList } from "@/components/analysis/recent-analyses-list";
import { LoginPromptDialog } from "@/components/auth";
import { useChatContext } from "@/contexts/chat-context";
import { useAuthStore } from "@/stores";
import { useLang } from "@/hooks/use-lang";
interface ChatPageLayoutProps {
  analysisId?: string | null;
}

export function ChatPageLayout({ analysisId }: ChatPageLayoutProps) {
  const { sendMessage, isProcessing, selectConversation } = useChatContext();
  const { isAuthenticated } = useAuthStore();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const { t } = useLang();
  useEffect(() => {
    if (analysisId) {
      selectConversation(analysisId);
    }
  }, [analysisId, selectConversation]);

  const handleFileSelected = useCallback(
    async (file: File, featureEngineering: boolean) => {
      if (!isAuthenticated) {
        setShowLoginPrompt(true);
        return;
      }
      const convId = await sendMessage("Analyze this data", file, undefined, featureEngineering);
      if (convId && typeof window !== "undefined") {
        window.history.replaceState(null, "", `/chat/${convId}`);
      }
    },
    [isAuthenticated, sendMessage]
  );

  const handleUrlSubmitted = useCallback(
    async (url: string) => {
      if (!isAuthenticated) {
        setShowLoginPrompt(true);
        return;
      }
      const convId = await sendMessage("Analyze this data", undefined, url);
      if (convId && typeof window !== "undefined") {
        window.history.replaceState(null, "", `/chat/${convId}`);
      }
    },
    [isAuthenticated, sendMessage]
  );

  // Determine if we should show the analysis layout
  const hasAnalysis = Boolean(analysisId) || isProcessing;

  return (
    <>
      {hasAnalysis ? (
        /* ── Post-upload: sub-bar + canvas + right sidebar + chat dock ── */
        <div className="flex h-full flex-col">
          {/* Sub-bar */}
          <div className="border-border bg-surface flex shrink-0 items-center gap-3 border-b px-4 py-2">
            {analysisId && (
              <span className="text-accent font-mono text-[9px] tracking-widest uppercase">
                {analysisId.slice(0, 8)}…
              </span>
            )}
            {isProcessing && (
              <span className="text-muted animate-pulse font-mono text-[9px] tracking-widest uppercase">
                {t.chat.processing}
              </span>
            )}
          </div>

          {/* Body: left sidebar + main canvas */}
          <div className="flex min-h-0 flex-1">
            {/* Left sidebar — recent analyses */}
            <aside className="border-foreground bg-surface hidden w-56 shrink-0 flex-col border-r-[2px] md:flex">
              {/* <div className="border-b border-border px-3 py-2">
                <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-foreground">
                  Recent Files
                </p>
              </div> */}
              <div className="flex-1 overflow-auto p-2">
                <RecentAnalysesList activeId={analysisId} />
              </div>
              <div className="border-border border-t p-2">
                <button
                  type="button"
                  onClick={() => {
                    window.history.pushState(null, "", "/chat");
                    window.location.reload();
                  }}
                  className="bg-accent text-accent-foreground hover:bg-accent-dark w-full py-2 font-sans text-[9px] font-bold tracking-widest uppercase transition-colors"
                >
                  {t.chat.uploadNew}
                </button>
              </div>
            </aside>

            {/* Main canvas */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <ChatContainer analysisId={analysisId} />
            </div>
          </div>

          {/* Chat dock — pinned bottom */}
          <ChatDock fileName={analysisId ?? null} />
        </div>
      ) : (
        /* ── Pre-upload: recent list on left + upload hero on right ── */
        <div className="flex h-full">
          {/* Left: recent analyses */}
          <aside className="border-foreground bg-surface hidden w-72 shrink-0 flex-col border-r-[2px] md:flex">
            {/* <div className="border-b border-border px-4 py-3">
              <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-foreground">
                Recent Analyses
              </p>
            </div> */}
            <div className="flex-1 overflow-auto p-3">
              <RecentAnalysesList />
            </div>
          </aside>

          {/* Right: upload hero */}
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
            {/* Eyebrow */}
            <p className="text-muted font-mono text-[9px] tracking-[3px] uppercase">
              {t.chat.heroTitle}
            </p>

            {/* Headline */}
            <h1 className="font-display text-foreground text-center text-4xl leading-none font-black tracking-tight whitespace-pre-line uppercase sm:text-5xl">
              {t.chat.heroSubtitle}
            </h1>

            {/* Upload zone */}
            <div className="w-full max-w-sm">
              <UploadZone
                onFileSelected={handleFileSelected}
                onUrlSubmitted={handleUrlSubmitted}
                disabled={isProcessing}
              />
            </div>

            {/* Stats row */}
            <div className="border-border flex items-center gap-6 border-t pt-6">
              <div className="text-center">
                <p className="font-display text-foreground text-2xl font-bold">12</p>
                <p className="text-muted font-mono text-[9px] tracking-wider uppercase">
                  {t.chat.heroChartTypes}
                </p>
              </div>
              <div className="bg-border h-8 w-px" />
              <div className="text-center">
                <p className="font-display text-foreground text-2xl font-bold">AI</p>
                <p className="text-muted font-mono text-[9px] tracking-wider uppercase">
                  {t.chat.heroPowered}
                </p>
              </div>
              <div className="bg-border h-8 w-px" />
              <div className="text-center">
                <p className="font-display text-accent text-2xl font-bold">∞</p>
                <p className="text-muted font-mono text-[9px] tracking-wider uppercase">
                  {t.chat.heroInsights}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <LoginPromptDialog open={showLoginPrompt} onOpenChange={setShowLoginPrompt} />
    </>
  );
}
