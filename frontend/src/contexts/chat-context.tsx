"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocalChat } from "@/hooks/use-local-chat";

type ChatContextValue = ReturnType<typeof useLocalChat>;

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const value = useLocalChat();

  useEffect(() => {
    value.connect();
    return () => value.disconnect();
  }, [value.connect, value.disconnect]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return ctx;
}
