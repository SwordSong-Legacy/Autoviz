"use client";

import { useEffect, useRef } from "react";
import { MarkdownContent } from "@/components/chat/markdown-content";
import { VizChatCard } from "@/components/chat/viz-chat-card";
import { useLang } from "@/hooks/use-lang";
import type { ChatThreadMessage } from "@/types";

interface MessageThreadProps {
  messages: ChatThreadMessage[];
  isProcessing: boolean;
}

export function MessageThread({ messages, isProcessing }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useLang();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-24">
        <p className="text-muted font-mono text-[9px] tracking-widest uppercase">
          {t.chat.emptyStateTitle}
        </p>
        <p className="text-foreground-2 max-w-md text-left text-sm">
          {t.chat.emptyStateLine1}
          <br />
          {t.chat.emptyStateLine2}
          <br />
          {t.chat.emptyStateLine3}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
        >
          <span className="text-muted font-mono text-[9px] tracking-widest uppercase">
            {msg.role === "user" ? "You" : "Assistant"}
          </span>

          <div
            className={`max-w-[85%] ${
              msg.role === "user" ? "bg-foreground text-background px-4 py-3" : "w-full"
            }`}
          >
            {msg.role === "user" ? (
              <p className="text-sm">{msg.content}</p>
            ) : (
              <>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MarkdownContent content={msg.content} />
                </div>
                {msg.isStreaming && !msg.content && (
                  <span className="bg-accent inline-block h-1.5 w-1.5 animate-ping rounded-full" />
                )}
                {msg.vizCards && msg.vizCards.length > 0 && <VizChatCard charts={msg.vizCards} />}
              </>
            )}
          </div>
        </div>
      ))}

      {isProcessing && (
        <div className="flex items-start gap-2">
          <span className="text-muted font-mono text-[9px] tracking-widest uppercase">
            Assistant
          </span>
          <span className="text-muted ml-2 inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
