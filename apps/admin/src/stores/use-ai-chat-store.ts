import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

export type AIChatRole = "user" | "assistant";

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
  /** 标记assistant消息为错误态（显式展示，不静默吞） */
  error?: boolean;
  /** 流式生成中的临时标记 */
  streaming?: boolean;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AIChatState {
  conversations: AIConversation[];
  activeId: string | null;
  streaming: boolean;
  /** 侧边 AI 面板展开状态（全局 overlay） */
  drawerOpen: boolean;

  createConversation: () => string;
  renameConversation: (id: string, title: string) => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  appendMessage: (convId: string, msg: AIChatMessage) => void;
  /** 流式追加 delta 到末条 assistant 消息；若无则新建 */
  appendDelta: (convId: string, delta: string) => void;
  /** 标记末条 streaming 消息为完成或错误 */
  finalizeLastAssistant: (convId: string, opts?: { error?: boolean }) => void;
  setStreaming: (b: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const MAX_CONVERSATIONS = 50;

function newId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "新对话";
  return trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed;
}

export const useAiChatStore = create<AIChatState>()(
  persist(
    (set) => ({
      conversations: [],
      activeId: null,
      streaming: false,
      drawerOpen: false,

      createConversation: () => {
        const id = newId();
        const conv: AIConversation = {
          id,
          title: "新对话",
          messages: [],
          createdAt: now(),
          updatedAt: now(),
        };
        set((state) => ({
          conversations: [conv, ...state.conversations].slice(0, MAX_CONVERSATIONS),
          activeId: id,
        }));
        return id;
      },

      renameConversation: (id, title) =>
        set((state) => {
          const nextTitle = title.trim();
          if (!nextTitle) return state;

          return {
            conversations: state.conversations.map((conversation) =>
              conversation.id === id && conversation.title !== nextTitle
                ? { ...conversation, title: nextTitle, updatedAt: now() }
                : conversation,
            ),
          };
        }),

      selectConversation: (id) => set({ activeId: id }),

      deleteConversation: (id) =>
        set((state) => {
          const conversations = state.conversations.filter((c) => c.id !== id);
          const activeId = state.activeId === id ? (conversations[0]?.id ?? null) : state.activeId;
          return { conversations, activeId };
        }),

      appendMessage: (convId, msg) =>
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== convId) return c;
            const messages = [...c.messages, msg];
            const title =
              c.messages.length === 0 && msg.role === "user" ? deriveTitle(msg.content) : c.title;
            return { ...c, messages, title, updatedAt: now() };
          }),
        })),

      appendDelta: (convId, delta) =>
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== convId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === "assistant" && last.streaming) {
              messages[messages.length - 1] = { ...last, content: last.content + delta };
            } else {
              messages.push({ role: "assistant", content: delta, streaming: true });
            }
            return { ...c, messages, updatedAt: now() };
          }),
        })),

      finalizeLastAssistant: (convId, opts) =>
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== convId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === "assistant") {
              messages[messages.length - 1] = {
                ...last,
                streaming: false,
                error: opts?.error ?? false,
              };
            }
            return { ...c, messages };
          }),
        })),

      setStreaming: (b) => set({ streaming: b }),

      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
    }),
    {
      name: STORAGE_KEYS.aiChat,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // streaming/drawerOpen 不持久化（重载后不应处于流式中）
      partialize: (s) => ({
        conversations: s.conversations,
        activeId: s.activeId,
      }),
    },
  ),
);
