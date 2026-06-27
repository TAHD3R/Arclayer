import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIModels } from "@/api/ai";
import { AIModelSelector } from "@/components/ai/ai-model-selector";
import {
  DEFAULT_AI_CHAT_MODEL,
  DEFAULT_AI_COMPOSER_MODE,
  DEFAULT_AI_REASONING_EFFORT,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@assistant-ui/react", () => ({
  useAssistantRuntime: () => null,
}));

vi.mock("@/api/ai", () => ({
  listAIModels: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "ai:AI_CHAT_MODEL_SELECT": "Select model",
        "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO": "DeepSeek V4 Pro",
        "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO_DESC": "DeepSeek model",
        "ai:AI_CHAT_MODEL_GPT_4O_MINI": "GPT-4o mini",
        "ai:AI_CHAT_MODEL_GPT_4O_MINI_DESC": "Fast model",
        "ai:AI_CHAT_REASONING_LABEL": "Thinking depth",
        "ai:AI_CHAT_REASONING_LOW": "Low",
        "ai:AI_CHAT_REASONING_MEDIUM": "Medium",
        "ai:AI_CHAT_REASONING_HIGH": "High",
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderSelector() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AIModelSelector />
    </QueryClientProvider>,
  );
}

describe("AIModelSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: null,
      lastProjectId: null,
    });
    useAiChatStore.setState({
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedModelSource: "default",
      selectedReasoningEffort: DEFAULT_AI_REASONING_EFFORT,
      selectedReasoningEffortSource: "default",
      composerMode: DEFAULT_AI_COMPOSER_MODE,
      composerModeSource: "default",
    });
    vi.mocked(listAIModels).mockResolvedValue({
      defaultModel: "deepseek-v4-pro",
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          labelKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO",
          description: "DeepSeek model",
          descriptionKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO_DESC",
          available: true,
        },
        {
          id: "gpt-4o-mini",
          provider: "openai",
          label: "GPT-4o mini",
          labelKey: "ai:AI_CHAT_MODEL_GPT_4O_MINI",
          description: "Fast model",
          descriptionKey: "ai:AI_CHAT_MODEL_GPT_4O_MINI_DESC",
          available: true,
        },
      ],
    });
  });

  it("keeps selectable model rows enabled inside the catalog popover", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(await screen.findByRole("button", { name: "Select model" }));

    const deepSeekItem = await screen.findByRole("menuitem", { name: /DeepSeek V4 Pro/ });
    expect(deepSeekItem).not.toHaveAttribute("aria-disabled", "true");
    expect(deepSeekItem).not.toHaveAttribute("data-disabled");

    await user.click(screen.getByRole("menuitem", { name: /GPT-4o mini/ }));

    await waitFor(() => {
      expect(useAiChatStore.getState().selectedModel).toBe("gpt-4o-mini");
    });
  });

  it("keeps the reasoning effort control active inside the dropdown", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(await screen.findByRole("button", { name: "Select model" }));
    await user.click(await screen.findByRole("button", { name: "High" }));

    expect(useAiChatStore.getState().selectedReasoningEffort).toBe("high");
  });

  it("applies runtime defaults from the backend catalog until the user chooses explicitly", async () => {
    vi.mocked(listAIModels).mockResolvedValue({
      defaultModel: "gpt-4o-mini",
      defaultMode: "plan",
      reasoningEffort: "high",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          labelKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO",
          description: "DeepSeek model",
          descriptionKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO_DESC",
          available: true,
        },
        {
          id: "gpt-4o-mini",
          provider: "openai",
          label: "GPT-4o mini",
          labelKey: "ai:AI_CHAT_MODEL_GPT_4O_MINI",
          description: "Fast model",
          descriptionKey: "ai:AI_CHAT_MODEL_GPT_4O_MINI_DESC",
          available: true,
        },
      ],
    });

    renderSelector();

    await waitFor(() => {
      expect(useAiChatStore.getState()).toMatchObject({
        selectedModel: "gpt-4o-mini",
        selectedModelSource: "default",
        selectedReasoningEffort: "high",
        selectedReasoningEffortSource: "default",
        composerMode: "plan",
        composerModeSource: "default",
      });
    });
  });

  it("does not overwrite explicit user runtime choices with backend defaults", async () => {
    useAiChatStore.setState({
      selectedModel: "deepseek-v4-pro",
      selectedModelSource: "user",
      selectedReasoningEffort: "low",
      selectedReasoningEffortSource: "user",
      composerMode: "agent",
      composerModeSource: "user",
    });
    vi.mocked(listAIModels).mockResolvedValue({
      defaultModel: "gpt-4o-mini",
      defaultMode: "plan",
      reasoningEffort: "high",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          labelKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO",
          description: "DeepSeek model",
          descriptionKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO_DESC",
          available: true,
        },
        {
          id: "gpt-4o-mini",
          provider: "openai",
          label: "GPT-4o mini",
          labelKey: "ai:AI_CHAT_MODEL_GPT_4O_MINI",
          description: "Fast model",
          descriptionKey: "ai:AI_CHAT_MODEL_GPT_4O_MINI_DESC",
          available: true,
        },
      ],
    });

    renderSelector();

    await waitFor(() => expect(listAIModels).toHaveBeenCalled());
    expect(useAiChatStore.getState()).toMatchObject({
      selectedModel: "deepseek-v4-pro",
      selectedModelSource: "user",
      selectedReasoningEffort: "low",
      selectedReasoningEffortSource: "user",
      composerMode: "agent",
      composerModeSource: "user",
    });
  });
});
