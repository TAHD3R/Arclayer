import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

export type AIChatRole = "user" | "assistant";
export type AIComposerMode = "build" | "plan" | "agent";
export type AIReasoningEffort = "low" | "medium" | "high";
export type AIAgentRunStatus = "running" | "interrupted" | "completed" | "cancelled" | "failed";
export type AIPreferenceSource = "default" | "user";

export interface AIAgentArtifactStep {
  id: string;
  title: string;
  status: string;
}

export type AIAgentMessageArtifact =
  | {
      type: "agent_execution_plan";
      goal: string;
      status: string;
      steps: AIAgentArtifactStep[];
      source?: string;
    }
  | {
      type: "agent_build_blueprint";
      goal: string;
      status: string;
      operations: AIAgentArtifactStep[];
      appliesChanges: boolean;
      requiresApprovalBeforeApply: boolean;
      source?: string;
    };

export interface AIWorkspaceActionProject {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface AIWorkspaceActionContentModel {
  id: string;
  name: string;
  singularKey: string;
  pluralKey: string;
  description?: string | null;
  modelKind: string;
}

export type AIWorkspaceActionArtifact =
  | {
      type: "workspace_project_created";
      status: "completed";
      project: AIWorkspaceActionProject;
      navigation: { label: string; path: string };
    }
  | {
      type: "workspace_project_list";
      status: "completed";
      projects: AIWorkspaceActionProject[];
      total: number;
      navigation: { label: string; path: string };
    }
  | {
      type: "workspace_content_model_created";
      status: "completed";
      contentModel: AIWorkspaceActionContentModel;
      navigation: { label: string; path: string };
    }
  | {
      type: "workspace_navigation";
      status: "completed";
      navigation: { label: string; path: string };
    };

export interface AIAgentInterrupt {
  kind: string;
  runId: string;
  agentId: string;
  mode: AIComposerMode;
  prompt: string;
  toolOutputs: Record<string, unknown>;
  requiredDecision: string;
  interruptId?: string;
  threadId?: string;
  checkpointId?: string;
}

export interface AIAgentExecutionSummary {
  toolNames: string[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
  reasoning?: string;
  agentRunId?: string;
  agentStatus?: AIAgentRunStatus;
  agentThreadId?: string;
  agentCheckpointId?: string;
  agentInterrupt?: AIAgentInterrupt;
  agentArtifact?: AIAgentMessageArtifact;
  workspaceAction?: AIWorkspaceActionArtifact;
  agentExecutionSummary?: AIAgentExecutionSummary;
  /** 标记assistant消息为错误态（显式展示，不静默吞） */
  error?: boolean;
  /** assistant-ui ErrorPrimitive 展示的产品化错误文案 */
  errorMessage?: string;
  /** 展开错误时展示的原始或结构化详情 */
  errorDetails?: string;
  /** 流式生成中的临时标记 */
  streaming?: boolean;
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIChatMessage[];
  contextSnapshot?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AIChatState {
  conversations: AIConversation[];
  activeId: string | null;
  streaming: boolean;
  selectedModel: string;
  selectedModelSource: AIPreferenceSource;
  selectedReasoningEffort: AIReasoningEffort;
  selectedReasoningEffortSource: AIPreferenceSource;
  composerMode: AIComposerMode;
  composerModeSource: AIPreferenceSource;
  selectedAgentId: string;
  /** 侧边 AI 面板展开状态（全局 overlay） */
  drawerOpen: boolean;

  createConversation: () => string;
  renameConversation: (id: string, title: string) => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  replaceConversations: (conversations: AIConversation[]) => void;
  upsertConversation: (conversation: AIConversation) => void;
  appendMessage: (convId: string, msg: AIChatMessage) => void;
  replaceMessages: (convId: string, messages: AIChatMessage[]) => void;
  setLastAssistantAgentRun: (
    convId: string,
    run: {
      runId: string;
      status?: AIChatMessage["agentStatus"];
      threadId?: string;
      checkpointId?: string;
      interrupt?: AIAgentInterrupt;
    },
  ) => void;
  /** 流式追加 delta 到末条 assistant 消息；若无则新建 */
  appendDelta: (convId: string, delta: string) => void;
  /** 流式追加模型显式返回的 reasoning delta；若无则新建 */
  appendReasoningDelta: (convId: string, delta: string) => void;
  /** 标记末条 streaming 消息为完成或错误 */
  finalizeLastAssistant: (
    convId: string,
    opts?: { error?: boolean; errorMessage?: string; errorDetails?: string },
  ) => void;
  setStreaming: (b: boolean) => void;
  setSelectedModel: (model: string, source?: AIPreferenceSource) => void;
  setSelectedReasoningEffort: (effort: AIReasoningEffort, source?: AIPreferenceSource) => void;
  setComposerMode: (mode: AIComposerMode, source?: AIPreferenceSource) => void;
  applyRuntimeDefaults: (defaults: {
    model?: string;
    reasoningEffort?: AIReasoningEffort;
    composerMode?: AIComposerMode;
  }) => void;
  setSelectedAgentId: (agentId: string) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const MAX_CONVERSATIONS = 50;
export const DEFAULT_AI_CHAT_MODEL = "deepseek-v4-pro";
export const AUTO_AI_CHAT_MODEL = "__auto__";
export const DEFAULT_AI_REASONING_EFFORT: AIReasoningEffort = "medium";
export const DEFAULT_AI_COMPOSER_MODE: AIComposerMode = "build";
export const DEFAULT_AI_AGENT_ID = "content_analyzer";

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

const AI_CHAT_PERSIST_VERSION = 4;

export const useAiChatStore = create<AIChatState>()(
  persist(
    (set) => ({
      conversations: [],
      activeId: null,
      streaming: false,
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedModelSource: "default",
      selectedReasoningEffort: DEFAULT_AI_REASONING_EFFORT,
      selectedReasoningEffortSource: "default",
      composerMode: DEFAULT_AI_COMPOSER_MODE,
      composerModeSource: "default",
      selectedAgentId: DEFAULT_AI_AGENT_ID,
      drawerOpen: false,

      createConversation: () => {
        const id = newId();
        const conv: AIConversation = {
          id,
          title: "新对话",
          messages: [],
          contextSnapshot: {},
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

      replaceConversations: (conversations) =>
        set((state) => ({
          conversations: conversations.slice(0, MAX_CONVERSATIONS),
          activeId:
            state.activeId &&
            conversations.some((conversation) => conversation.id === state.activeId)
              ? state.activeId
              : (conversations[0]?.id ?? null),
        })),

      upsertConversation: (conversation) =>
        set((state) => {
          const exists = state.conversations.some((item) => item.id === conversation.id);
          const conversations = exists
            ? state.conversations.map((item) => (item.id === conversation.id ? conversation : item))
            : [conversation, ...state.conversations];
          return {
            conversations: conversations.slice(0, MAX_CONVERSATIONS),
            activeId: state.activeId ?? conversation.id,
          };
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

      replaceMessages: (convId, messages) =>
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, messages, updatedAt: now() } : c,
          ),
        })),

      setLastAssistantAgentRun: (convId, run) =>
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== convId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (last?.role === "assistant") {
              messages[messages.length - 1] = {
                ...last,
                agentRunId: run.runId,
                agentStatus: run.status ?? last.agentStatus,
                agentThreadId: run.threadId ?? last.agentThreadId,
                agentCheckpointId: run.checkpointId ?? last.agentCheckpointId,
                agentInterrupt: run.interrupt ?? last.agentInterrupt,
              };
            }
            return { ...c, messages, updatedAt: now() };
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

      appendReasoningDelta: (convId, delta) =>
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id !== convId) return c;
            const messages = [...c.messages];
            const last = messages[messages.length - 1];
            if (last && last.role === "assistant" && last.streaming) {
              messages[messages.length - 1] = {
                ...last,
                reasoning: `${last.reasoning ?? ""}${delta}`,
              };
            } else {
              messages.push({ role: "assistant", content: "", reasoning: delta, streaming: true });
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
                errorMessage: opts?.errorMessage,
                errorDetails: opts?.errorDetails,
              };
            }
            return { ...c, messages };
          }),
        })),

      setStreaming: (b) => set({ streaming: b }),
      setSelectedModel: (model, source = "user") => {
        const next = model.trim();
        if (!next) return;
        set({ selectedModel: next, selectedModelSource: source });
      },
      setSelectedReasoningEffort: (effort, source = "user") =>
        set({ selectedReasoningEffort: effort, selectedReasoningEffortSource: source }),
      setComposerMode: (mode, source = "user") =>
        set({ composerMode: mode, composerModeSource: source }),
      applyRuntimeDefaults: (defaults) =>
        set((state) => {
          const patch: Partial<AIChatState> = {};
          const model = defaults.model?.trim();
          if (model && state.selectedModelSource === "default" && state.selectedModel !== model) {
            patch.selectedModel = model;
          }
          if (
            defaults.reasoningEffort &&
            state.selectedReasoningEffortSource === "default" &&
            state.selectedReasoningEffort !== defaults.reasoningEffort
          ) {
            patch.selectedReasoningEffort = defaults.reasoningEffort;
          }
          if (
            defaults.composerMode &&
            state.composerModeSource === "default" &&
            state.composerMode !== defaults.composerMode
          ) {
            patch.composerMode = defaults.composerMode;
          }
          return Object.keys(patch).length > 0 ? patch : state;
        }),
      setSelectedAgentId: (agentId) => set({ selectedAgentId: agentId }),

      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
    }),
    {
      name: STORAGE_KEYS.aiChat,
      storage: createJSONStorage(() => localStorage),
      version: AI_CHAT_PERSIST_VERSION,
      // Conversations and messages are backend-owned. Local storage keeps only non-sensitive UI preferences.
      partialize: (s) => ({
        selectedModel: s.selectedModel,
        selectedModelSource: s.selectedModelSource,
        selectedReasoningEffort: s.selectedReasoningEffort,
        selectedReasoningEffortSource: s.selectedReasoningEffortSource,
        composerMode: s.composerMode,
        composerModeSource: s.composerModeSource,
        selectedAgentId: s.selectedAgentId,
      }),
      migrate: (persisted) => {
        const state = persisted as Partial<AIChatState>;
        return {
          selectedModel: state.selectedModel ?? DEFAULT_AI_CHAT_MODEL,
          selectedModelSource:
            state.selectedModelSource ?? (state.selectedModel ? "user" : "default"),
          selectedReasoningEffort: state.selectedReasoningEffort ?? DEFAULT_AI_REASONING_EFFORT,
          selectedReasoningEffortSource:
            state.selectedReasoningEffortSource ??
            (state.selectedReasoningEffort ? "user" : "default"),
          composerMode: state.composerMode ?? DEFAULT_AI_COMPOSER_MODE,
          composerModeSource: state.composerModeSource ?? (state.composerMode ? "user" : "default"),
          selectedAgentId: state.selectedAgentId ?? DEFAULT_AI_AGENT_ID,
          conversations: [],
          activeId: null,
          streaming: false,
        };
      },
    },
  ),
);
