"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { conversationsApi } from "@/lib/api/conversations";
import type { ChatMessage, ToolCall } from "@/types";

export interface ApiConversation {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  vizCount?: number;
  csvFilename?: string | null;
}

interface ApiChatState {
  conversations: ApiConversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  error: string | null;

  createConversation: () => Promise<string>;
  selectConversation: (id: string | null) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  getCurrentConversation: () => ApiConversation | null;
  getCurrentMessages: () => ChatMessage[];

  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  addToolCall: (messageId: string, toolCall: ToolCall) => void;
  updateToolCall: (messageId: string, toolCallId: string, update: Partial<ToolCall>) => void;
  clearCurrentMessages: () => Promise<void>;

  fetchConversations: () => Promise<void>;
  fetchConversation: (id: string) => Promise<void>;

  reset: () => void;
}

const initialState = {
  conversations: [] as ApiConversation[],
  currentConversationId: null as string | null,
  isLoading: false,
  error: null as string | null,
};

export const useApiChatStore = create<ApiChatState>((set, get) => ({
  ...initialState,

  createConversation: async () => {
    try {
      set({ isLoading: true, error: null });
      const conv = await conversationsApi.create(null);
      const apiConv: ApiConversation = {
        id: conv.id,
        title: conv.title,
        messages: [],
        createdAt: conv.created_at,
        updatedAt: conv.updated_at ?? conv.created_at,
      };
      set((s) => ({
        conversations: [apiConv, ...s.conversations],
        currentConversationId: conv.id,
        isLoading: false,
        error: null,
      }));
      return conv.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create conversation";
      set({ isLoading: false, error: msg });
      throw err;
    }
  },

  selectConversation: (id) => {
    set({ currentConversationId: id });
  },

  deleteConversation: async (id) => {
    try {
      await conversationsApi.delete(id);
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        currentConversationId: s.currentConversationId === id ? null : s.currentConversationId,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      set({ error: msg });
      throw err;
    }
  },

  renameConversation: async (id, title) => {
    try {
      await conversationsApi.update(id, { title });
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
        ),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to rename";
      set({ error: msg });
      throw err;
    }
  },

  getCurrentConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.currentConversationId) || null;
  },

  getCurrentMessages: () => {
    const state = get();
    const conv = state.conversations.find((c) => c.id === state.currentConversationId);
    return conv?.messages ?? [];
  },

  addMessage: (message) => {
    set((s) => {
      const convId = s.currentConversationId;
      if (!convId) return s;
      return {
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: new Date().toISOString(),
                title:
                  c.title ||
                  (message.role === "user"
                    ? message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "")
                    : null),
              }
            : c
        ),
      };
    });
  },

  updateMessage: (id, updater) => {
    set((s) => {
      const convId = s.currentConversationId;
      if (!convId) return s;
      return {
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((msg) => (msg.id === id ? updater(msg) : msg)),
                updatedAt: new Date().toISOString(),
              }
            : c
        ),
      };
    });
  },

  addToolCall: (messageId, toolCall) => {
    set((s) => {
      const convId = s.currentConversationId;
      if (!convId) return s;
      return {
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((msg) =>
                  msg.id === messageId
                    ? { ...msg, toolCalls: [...(msg.toolCalls || []), toolCall] }
                    : msg
                ),
                updatedAt: new Date().toISOString(),
              }
            : c
        ),
      };
    });
  },

  updateToolCall: (messageId, toolCallId, update) => {
    set((s) => {
      const convId = s.currentConversationId;
      if (!convId) return s;
      return {
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((msg) =>
                  msg.id === messageId
                    ? {
                        ...msg,
                        toolCalls: msg.toolCalls?.map((tc) =>
                          tc.id === toolCallId ? { ...tc, ...update } : tc
                        ),
                      }
                    : msg
                ),
                updatedAt: new Date().toISOString(),
              }
            : c
        ),
      };
    });
  },

  clearCurrentMessages: async () => {
    const convId = get().currentConversationId;
    if (!convId) return;
    try {
      await conversationsApi.clearMessages(convId);
      set((s) =>
        s.currentConversationId === convId
          ? {
              conversations: s.conversations.map((c) =>
                c.id === convId ? { ...c, messages: [], updatedAt: new Date().toISOString() } : c
              ),
            }
          : s
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear messages";
      set({ error: msg });
      throw err;
    }
  },

  fetchConversations: async () => {
    try {
      set({ isLoading: true, error: null });
      const list = await conversationsApi.list();
      const convs: ApiConversation[] = list.map((c) => ({
        id: c.id,
        title: c.title,
        messages: [],
        createdAt: c.created_at,
        updatedAt: c.updated_at ?? c.created_at,
        vizCount: c.viz_count ?? 0,
        csvFilename: c.csv_filename ?? null,
      }));
      set((s) => ({
        conversations: convs,
        isLoading: false,
        error: null,
        currentConversationId:
          s.currentConversationId && convs.some((c) => c.id === s.currentConversationId)
            ? s.currentConversationId
            : (convs[0]?.id ?? null),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load conversations";
      set({ isLoading: false, error: msg });
    }
  },

  fetchConversation: async (id) => {
    try {
      const conv = await conversationsApi.get(id);
      const messages = conv.messages.map(conversationsApi.toChatMessage);
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id
            ? { ...c, messages, title: conv.title, updatedAt: conv.updated_at ?? c.updatedAt }
            : c
        ),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load conversation";
      set({ error: msg });
    }
  },

  reset: () => set(initialState),
}));
