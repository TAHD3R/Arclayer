import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIModels } from "@/api/ai";
import { AIModelSelector } from "@/components/ai/ai-model-selector";
import {
  AUTO_AI_CHAT_MODEL,
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
        "ai:AI_CHAT_MODEL_GROUP": "Models",
        "ai:AI_CHAT_MODEL_AUTO": "Auto select",
        "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO": "DeepSeek V4 Pro",
        "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO_DESC": "DeepSeek model",
        "ai:AI_CHAT_MODEL_GPT_4O_MINI": "GPT-4o mini",
        "ai:AI_CHAT_MODEL_GPT_4O_MINI_DESC": "Fast model",
        "ai:AI_CHAT_MODEL_EMPTY": "No models configured",
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

  it("disables manual model selection only while automatic selection is enabled", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(await screen.findByRole("button", { name: "Select model" }));
    const autoSwitch = screen.getByRole("switch", { name: "Auto select" });
    expect(autoSwitch).not.toBeChecked();

    await user.click(autoSwitch);

    expect(useAiChatStore.getState().selectedModel).toBe(AUTO_AI_CHAT_MODEL);
    expect(screen.getByRole("menuitem", { name: /DeepSeek V4 Pro/ })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByRole("menuitem", { name: /GPT-4o mini/ })).toHaveAttribute("data-disabled");

    await user.click(autoSwitch);

    expect(useAiChatStore.getState().selectedModel).toBe("deepseek-v4-pro");
    expect(screen.getByRole("menuitem", { name: /DeepSeek V4 Pro/ })).not.toHaveAttribute(
      "data-disabled",
    );
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

  it("does not display unavailable catalog models when no runtime model is configured", async () => {
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
          available: false,
        },
      ],
    });

    const user = userEvent.setup();
    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent(
        "No models configured",
      );
    });
    expect(screen.queryByText("DeepSeek V4 Pro")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.queryByRole("menuitem", { name: /DeepSeek V4 Pro/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("No models configured").length).toBeGreaterThan(0);
  });

  it("keeps explicit model and mode choices while applying backend reasoning defaults", async () => {
    useAiChatStore.setState({
      selectedModel: "deepseek-v4-pro",
      selectedModelSource: "user",
      selectedReasoningEffort: "low",
      selectedReasoningEffortSource: "user",
      composerMode: "build",
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

    await waitFor(() => {
      expect(useAiChatStore.getState()).toMatchObject({
        selectedModel: "deepseek-v4-pro",
        selectedModelSource: "user",
        selectedReasoningEffort: "high",
        selectedReasoningEffortSource: "default",
        composerMode: "build",
        composerModeSource: "user",
      });
    });
  });
});
