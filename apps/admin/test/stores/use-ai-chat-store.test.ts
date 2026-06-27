import { beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  DEFAULT_AI_AGENT_ID,
  DEFAULT_AI_CHAT_MODEL,
  DEFAULT_AI_COMPOSER_MODE,
  DEFAULT_AI_REASONING_EFFORT,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";

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
    });
  });

  it("does not persist conversations or messages to localStorage", () => {
    const conversationId = useAiChatStore.getState().createConversation();
    useAiChatStore.getState().appendMessage(conversationId, {
      role: "user",
      content: "Review the launch draft",
    });

    const state = persistedAIChatState();

    expect(state).not.toHaveProperty("conversations");
    expect(state).not.toHaveProperty("activeId");
    expect(state).toMatchObject({
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedModelSource: "default",
      composerMode: DEFAULT_AI_COMPOSER_MODE,
      composerModeSource: "default",
      selectedAgentId: DEFAULT_AI_AGENT_ID,
    });
    expect(state).not.toHaveProperty("selectedReasoningEffort");
    expect(state).not.toHaveProperty("selectedReasoningEffortSource");
  });

  it("drops legacy locally persisted conversations during migration", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiChat,
      JSON.stringify({
        version: 2,
        state: {
          conversations: [
            {
              id: "legacy-conversation",
              title: "Legacy local conversation",
              messages: [{ role: "user", content: "local only" }],
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          activeId: "legacy-conversation",
          selectedModel: "deepseek-v4-pro",
          selectedReasoningEffort: "high",
          composerMode: "plan",
          selectedAgentId: "content_writer",
        },
      }),
    );

    await useAiChatStore.persist.rehydrate();

    expect(useAiChatStore.getState().conversations).toEqual([]);
    expect(useAiChatStore.getState().activeId).toBeNull();
    expect(useAiChatStore.getState().selectedReasoningEffort).toBe(DEFAULT_AI_REASONING_EFFORT);
    expect(useAiChatStore.getState().selectedReasoningEffortSource).toBe("default");
    expect(useAiChatStore.getState().composerMode).toBe("plan");
    expect(useAiChatStore.getState().composerModeSource).toBe("user");
    expect(useAiChatStore.getState().selectedAgentId).toBe("content_writer");
  });

  it("always applies managed reasoning defaults while preserving explicit model and mode choices", () => {
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
    useAiChatStore.getState().setComposerMode("agent");
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
      composerMode: "agent",
      composerModeSource: "user",
    });
  });
});
