"use client";

import { useChatContext } from "@/contexts/chat-context";
import { ChatInput } from "./chat-input";

interface ChatDockProps {
  fileName?: string | null;
}

export function ChatDock({ fileName }: ChatDockProps) {
  const {
    isProcessing,
    pendingMcq,
    currentConversationId,
    sendMultiTurnMessage,
    isChatProcessing,
  } = useChatContext();

  // Chat dock is text-only. Data ingestion happens in the initial upload area.
  const handleSend = (content: string) => {
    if (!currentConversationId) return;
    sendMultiTurnMessage(content);
  };

  return (
    <div className="border-foreground bg-background border-t-[3px] px-4 py-3">
      <div className="flex items-center gap-3">
        {fileName && (
          <span className="text-accent flex-shrink-0 font-mono text-[9px] tracking-widest uppercase">
            {fileName} ▸
          </span>
        )}
        <div className="border-border bg-surface flex-1 border px-3 py-1">
          <ChatInput
            onSend={handleSend}
            isProcessing={isProcessing || isChatProcessing || !!pendingMcq}
          />
        </div>
      </div>
    </div>
  );
}
