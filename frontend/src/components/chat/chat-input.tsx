"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isProcessing?: boolean;
}

export function ChatInput({ onSend, disabled, isProcessing }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isProcessing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isProcessing]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = message.trim();

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex gap-1">
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            rows={1}
            className="placeholder:text-muted-foreground w-full resize-none bg-transparent pr-14 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
          />
          <Button
            type="submit"
            size="icon"
            disabled={disabled || !canSend}
            className="absolute top-0 right-0 h-7 w-7 rounded-md"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
