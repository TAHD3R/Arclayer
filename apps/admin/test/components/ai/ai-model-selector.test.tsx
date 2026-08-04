import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIModels } from "@/api/ai";
import { AIModelSelector } from "@/components/ai/ai-model-selector";
import {
  AUTO_AI_CHAT_MODEL,
  DEFAULT_AI_COMPOSER_MODE,
  DEFAULT_AI_REASONING_EFFORT,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const i18nState = vi.hoisted(() => ({ language: "en-US" }));

vi.mock("@assistant-ui/react", () => ({
  useAssistantRuntime: () => null,
}));

vi.mock("@/api/ai", () => ({
  listAIModels: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      get language() {
        return i18nState.language;
      },
      get resolvedLanguage() {
        return i18nState.language;
      },
    },
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
    i18nState.language = "en-US";
    localStorage.clear();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: null,
      lastProjectId: null,
    });
    useAiChatStore.setState({
      selectedModel: AUTO_AI_CHAT_MODEL,
      selectedModelSource: "default",
      selectedReasoningEffort: DEFAULT_AI_REASONING_EFFORT,
      selectedReasoningEffortSource: "default",
      composerMode: DEFAULT_AI_COMPOSER_MODE,
      composerModeSource: "default",
    });
    usePreferencesStore.setState({ themeMode: "light", themePreference: "light" });
    vi.mocked(listAIModels).mockResolvedValue({
      defaultModel: "deepseek-v4-pro",
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          labelI18n: { "zh-CN": "DeepSeek V4 专业版" },
          description: "DeepSeek model",
          descriptionI18n: { "zh-CN": "DeepSeek 模型" },
          providerIcon: {
            lightUrl: "/provider-icons/deepseek-light.svg",
            darkUrl: "/provider-icons/deepseek-dark.svg",
          },
          available: true,
        },
        {
          id: "gpt-4o-mini",
          provider: "openai",
          label: "GPT-4o mini",
          labelI18n: {},
          description: "Fast model",
          descriptionI18n: {},
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

  it("uses the provider icon from the catalog and switches it with the resolved theme", async () => {
    renderSelector();

    const trigger = await screen.findByRole("button", { name: "Select model" });
    await waitFor(() => {
      expect(trigger.querySelector("img")).toHaveAttribute(
        "src",
        "/provider-icons/deepseek-light.svg",
      );
    });

    act(() => {
      usePreferencesStore.setState({ themeMode: "dark", themePreference: "dark" });
    });

    expect(trigger.querySelector("img")).toHaveAttribute(
      "src",
      "/provider-icons/deepseek-dark.svg",
    );
  });

  it("uses configured localized model copy for the current product language", async () => {
    i18nState.language = "zh-CN";
    const user = userEvent.setup();
    renderSelector();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent(
        "DeepSeek V4 专业版",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getAllByText("DeepSeek V4 专业版")).toHaveLength(2);
    expect(screen.getByText("DeepSeek 模型")).toBeInTheDocument();
  });

  it("renders base model copy when cached catalog data has no localization maps", async () => {
    const user = userEvent.setup();
    vi.mocked(listAIModels).mockResolvedValue({
      defaultModel: "gpt-5.6-test",
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "gpt-5.6-test",
          provider: "openai",
          label: "GPT-5.6 Test",
          description: "Configured test model",
          available: true,
        },
      ],
    } as never);

    renderSelector();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select model" })).toHaveTextContent(
        "GPT-5.6 Test",
      );
    });
    await user.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getByText("Configured test model")).toBeInTheDocument();
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
          labelI18n: {},
          description: "DeepSeek model",
          descriptionI18n: {},
          available: true,
        },
        {
          id: "gpt-4o-mini",
          provider: "openai",
          label: "GPT-4o mini",
          labelI18n: {},
          description: "Fast model",
          descriptionI18n: {},
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

  it("displays the empty state when the catalog has no models", async () => {
    vi.mocked(listAIModels).mockResolvedValue({
      defaultModel: null,
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [],
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

  it("does not infer the first catalog model when no default is configured", async () => {
    vi.mocked(listAIModels).mockResolvedValue({
      defaultModel: null,
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          labelI18n: {},
          description: "DeepSeek model",
          descriptionI18n: {},
          available: true,
        },
        {
          id: "gpt-4o-mini",
          provider: "openai",
          label: "GPT-4o mini",
          labelI18n: {},
          description: "Fast model",
          descriptionI18n: {},
          available: true,
        },
      ],
    });
    const user = userEvent.setup();

    renderSelector();

    await waitFor(() => {
      expect(useAiChatStore.getState()).toMatchObject({
        selectedModel: AUTO_AI_CHAT_MODEL,
        selectedModelSource: "default",
      });
    });
    await user.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getByRole("switch", { name: "Auto select" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /DeepSeek V4 Pro/ })).not.toHaveAttribute(
      "data-disabled",
    );

    await user.click(screen.getByRole("menuitem", { name: /GPT-4o mini/ }));

    expect(useAiChatStore.getState()).toMatchObject({
      selectedModel: "gpt-4o-mini",
      selectedModelSource: "user",
    });
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
          labelI18n: {},
          description: "DeepSeek model",
          descriptionI18n: {},
          available: true,
        },
        {
          id: "gpt-4o-mini",
          provider: "openai",
          label: "GPT-4o mini",
          labelI18n: {},
          description: "Fast model",
          descriptionI18n: {},
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
