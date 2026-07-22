import { beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  DEFAULT_AI_AGENT_ID,
  DEFAULT_AI_CHAT_MODEL,
  DEFAULT_AI_COMPOSER_MODE,
  DEFAULT_AI_REASONING_EFFORT,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";

const PUBLIC_AGENT_ID = "A1b2C3d4E5f6G7h8I9j0K1";

function persistedAIChatState(): Record<string, unknown> {
  const raw = window.localStorage.getItem(STORAGE_KEYS.aiChat);
  expect(raw).toBeTruthy();
  const parsed = JSON.parse(String(raw)) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

describe("useAiChatStore persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAiChatStore.setState({
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedModelSource: "default",
      selectedReasoningEffort: DEFAULT_AI_REASONING_EFFORT,
      selectedReasoningEffortSource: "default",
      composerMode: DEFAULT_AI_COMPOSER_MODE,
      composerModeSource: "default",
      selectedAgentId: DEFAULT_AI_AGENT_ID,
      webSearchEnabled: false,
      drawerOpen: false,
    });
  });

  it("contains only assistant preferences and drawer UI state", () => {
    const state = useAiChatStore.getState();

    expect(state).not.toHaveProperty("conversations");
    expect(state).not.toHaveProperty("activeId");
    expect(state).not.toHaveProperty("streaming");
    expect(state).not.toHaveProperty("createConversation");
    expect(state).not.toHaveProperty("appendMessage");
  });

  it("persists explicit model, mode, and agent preferences only", () => {
    useAiChatStore.getState().setSelectedModel("gpt-4o-mini");
    useAiChatStore.getState().setComposerMode("plan");
    useAiChatStore.getState().setSelectedAgentId(PUBLIC_AGENT_ID);
    useAiChatStore.getState().setWebSearchEnabled(true);
    useAiChatStore.getState().openDrawer();

    const state = persistedAIChatState();

    expect(state).toEqual({
      selectedModel: "gpt-4o-mini",
      selectedModelSource: "user",
      composerMode: "plan",
      composerModeSource: "user",
      selectedAgentId: PUBLIC_AGENT_ID,
    });
  });

  it("drops legacy conversation fields and retired Agent slugs", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiChat,
      JSON.stringify({
        version: 2,
        state: {
          conversations: [
            {
              id: "legacy-conversation",
              messages: [{ role: "user", content: "local only" }],
            },
          ],
          activeId: "legacy-conversation",
          streaming: true,
          selectedModel: "gpt-4o-mini",
          composerMode: "plan",
          selectedAgentId: "content_writer",
        },
      }),
    );

    await useAiChatStore.persist.rehydrate();

    const state = useAiChatStore.getState();
    expect(state).not.toHaveProperty("conversations");
    expect(state).not.toHaveProperty("activeId");
    expect(state).not.toHaveProperty("streaming");
    expect(state.selectedReasoningEffort).toBe(DEFAULT_AI_REASONING_EFFORT);
    expect(state.selectedReasoningEffortSource).toBe("default");
    expect(state.composerMode).toBe("plan");
    expect(state.composerModeSource).toBe("user");
    expect(state.selectedAgentId).toBeNull();
  });

  it("applies managed defaults while preserving explicit model and mode choices", () => {
    useAiChatStore.getState().applyRuntimeDefaults({
      model: "gpt-4o-mini",
      reasoningEffort: "high",
      composerMode: "plan",
    });

    expect(useAiChatStore.getState()).toMatchObject({
      selectedModel: "gpt-4o-mini",
      selectedModelSource: "default",
      selectedReasoningEffort: "high",
      selectedReasoningEffortSource: "default",
      composerMode: "plan",
      composerModeSource: "default",
    });

    useAiChatStore.getState().setSelectedModel("deepseek-v4-pro");
    useAiChatStore.getState().setComposerMode("plan");
    useAiChatStore.getState().applyRuntimeDefaults({
      model: "gpt-4o-mini",
      reasoningEffort: "medium",
      composerMode: "build",
    });

    expect(useAiChatStore.getState()).toMatchObject({
      selectedModel: "deepseek-v4-pro",
      selectedModelSource: "user",
      selectedReasoningEffort: "medium",
      selectedReasoningEffortSource: "default",
      composerMode: "plan",
      composerModeSource: "user",
    });
  });

  it("migrates the removed Agent mode to Build and removes its retired Agent slug", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiChat,
      JSON.stringify({
        version: 6,
        state: {
          composerMode: "agent",
          composerModeSource: "user",
          selectedAgentId: "content_model_advisor",
        },
      }),
    );

    await useAiChatStore.persist.rehydrate();

    expect(useAiChatStore.getState()).toMatchObject({
      composerMode: "build",
      composerModeSource: "user",
      selectedAgentId: null,
    });
  });
});
