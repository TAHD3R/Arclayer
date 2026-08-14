import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

export type AIComposerMode = "build" | "plan";
export type AIReasoningEffort = "low" | "medium" | "high";
export type AIPreferenceSource = "default" | "user";

export type AiEditorContextStage = "sitemap" | "wireframe" | "styleGuide" | "design";
export type AiEditorContextTargetKind = "page" | "section" | "styleGuide";

export interface AiEditorContext {
  stage: AiEditorContextStage;
  pageId?: string;
  pageLabel?: string;
  targetKind?: AiEditorContextTargetKind;
  targetId?: string;
  label: string;
}

export interface AIChatState {
  selectedModel: string;
  selectedModelSource: AIPreferenceSource;
  selectedReasoningEffort: AIReasoningEffort;
  selectedReasoningEffortSource: AIPreferenceSource;
  composerMode: AIComposerMode;
  composerModeSource: AIPreferenceSource;
  selectedAgentId: string | null;
  webSearchEnabled: boolean;
  drawerOpen: boolean;
  /**
   * One-shot editor context set by `openDrawer(context)`. The drawer consumes it by attaching
   * it to the composer as an assistant-ui editor-context attachment.
   */
  pendingEditorContext: AiEditorContext | null;

  setSelectedModel: (model: string, source?: AIPreferenceSource) => void;
  setComposerMode: (mode: AIComposerMode, source?: AIPreferenceSource) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  applyRuntimeDefaults: (defaults: {
    model?: string;
    reasoningEffort?: AIReasoningEffort;
    composerMode?: AIComposerMode;
  }) => void;
  setSelectedAgentId: (agentId: string | null) => void;
  openDrawer: (context?: AiEditorContext) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  consumePendingEditorContext: () => AiEditorContext | null;
}

export const AUTO_AI_CHAT_MODEL = "__auto__";
export const DEFAULT_AI_REASONING_EFFORT: AIReasoningEffort = "medium";
export const DEFAULT_AI_COMPOSER_MODE: AIComposerMode = "build";
export const DEFAULT_AI_AGENT_ID: null = null;

const AI_CHAT_PERSIST_VERSION = 9;

export function resolveAIRequestModel(model: string): string | undefined {
  return model === AUTO_AI_CHAT_MODEL ? undefined : model;
}

export const useAiChatStore = create<AIChatState>()(
  persist(
    (set, get) => ({
      selectedModel: AUTO_AI_CHAT_MODEL,
      selectedModelSource: "default",
      selectedReasoningEffort: DEFAULT_AI_REASONING_EFFORT,
      selectedReasoningEffortSource: "default",
      composerMode: DEFAULT_AI_COMPOSER_MODE,
      composerModeSource: "default",
      selectedAgentId: DEFAULT_AI_AGENT_ID,
      webSearchEnabled: false,
      drawerOpen: false,
      pendingEditorContext: null,

      setSelectedModel: (model, source = "user") => {
        const next = model.trim();
        if (!next) return;
        set({ selectedModel: next, selectedModelSource: source });
      },
      setComposerMode: (mode, source = "user") =>
        set({ composerMode: mode, composerModeSource: source }),
      setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),
      applyRuntimeDefaults: (defaults) =>
        set((state) => {
          const patch: Partial<AIChatState> = {};
          const model = defaults.model?.trim();
          if (model && state.selectedModelSource === "default" && state.selectedModel !== model) {
            patch.selectedModel = model;
          }
          if (
            defaults.reasoningEffort &&
            (state.selectedReasoningEffort !== defaults.reasoningEffort ||
              state.selectedReasoningEffortSource !== "default")
          ) {
            patch.selectedReasoningEffort = defaults.reasoningEffort;
            patch.selectedReasoningEffortSource = "default";
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
      openDrawer: (context) => set({ drawerOpen: true, pendingEditorContext: context ?? null }),
      closeDrawer: () => set({ drawerOpen: false, pendingEditorContext: null }),
      toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
      consumePendingEditorContext: () => {
        const context = get().pendingEditorContext;
        if (context) set({ pendingEditorContext: null });
        return context;
      },
    }),
    {
      name: STORAGE_KEYS.aiChat,
      storage: createJSONStorage(() => localStorage),
      version: AI_CHAT_PERSIST_VERSION,
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        selectedModelSource: state.selectedModelSource,
        composerMode: state.composerMode,
        composerModeSource: state.composerModeSource,
        selectedAgentId: state.selectedAgentId,
      }),
      migrate: (persisted) => {
        const state = persisted as Partial<AIChatState>;
        const composerMode: AIComposerMode = state.composerMode === "plan" ? "plan" : "build";
        const persistedModel =
          typeof state.selectedModel === "string" ? state.selectedModel.trim() : "";
        const hasExplicitModel = state.selectedModelSource === "user" && Boolean(persistedModel);
        return {
          selectedModel: hasExplicitModel ? persistedModel : AUTO_AI_CHAT_MODEL,
          selectedModelSource: hasExplicitModel ? ("user" as const) : ("default" as const),
          selectedReasoningEffort: DEFAULT_AI_REASONING_EFFORT,
          selectedReasoningEffortSource: "default" as const,
          composerMode,
          composerModeSource: state.composerModeSource ?? (state.composerMode ? "user" : "default"),
          selectedAgentId: isPublicAgentId(state.selectedAgentId) ? state.selectedAgentId : null,
          webSearchEnabled: false,
          drawerOpen: false,
        };
      },
    },
  ),
);

function isPublicAgentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22}$/u.test(value);
}
