import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIProjectAgents } from "@/api/ai";
import {
  AIComposerContextControls,
  AIComposerInputActions,
} from "@/components/ai/ai-composer-toolbar";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/ai", () => ({
  listAIProjectAgents: vi.fn(),
}));

vi.mock("@/components/ai/ai-model-selector", () => ({
  AIModelSelector: () => <div data-testid="ai-model-selector" />,
}));

vi.mock("@assistant-ui/react", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    AuiIf: Passthrough,
    ComposerPrimitive: {
      AddAttachment: Passthrough,
      Cancel: Passthrough,
      Dictate: Passthrough,
      Send: Passthrough,
      StopDictation: Passthrough,
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "ai:AI_CHAT_MODE_SELECT": "Select work mode",
        "ai:AI_CHAT_MODE_BUILD": "Build",
        "ai:AI_CHAT_MODE_BUILD_DESC": "Apply focused code and UI changes",
        "ai:AI_CHAT_MODE_PLAN": "Plan",
        "ai:AI_CHAT_MODE_PLAN_DESC": "Shape the approach before editing",
        "ai:AI_CHAT_MODE_AGENT": "Project Copilot",
        "ai:AI_CHAT_MODE_AGENT_DESC": "Read project context",
        "ai:AI_CHAT_MODE_UNAVAILABLE_DESC": `${values?.description ?? ""} · Unavailable`,
        "ai:AI_CHAT_COMPOSER_ADD_MENU": "Add context",
        "ai:AI_CHAT_UPLOAD_FILE": "Upload file",
        "ai:AI_CHAT_WEB_SEARCH": "Web search",
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderControls() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AIComposerContextControls />
    </QueryClientProvider>,
  );
}

function renderInputActions() {
  return render(<AIComposerInputActions />);
}

describe("AIComposerContextControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
    useAiChatStore.setState({
      composerMode: "build",
    });
    vi.mocked(listAIProjectAgents).mockResolvedValue({
      agents: [
        {
          agentId: "content_advisor",
          name: "Content Advisor",
          description: "Plan content work",
          mode: "plan",
          skillId: "content.planning",
          toolNames: ["search_content"],
          readOnly: true,
          requiresApproval: false,
        },
      ],
      tools: [],
      skills: [],
    });
  });

  it("keeps build and plan available without matching project agents", async () => {
    const user = userEvent.setup();
    renderControls();

    await waitFor(() => expect(listAIProjectAgents).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Select work mode" }));

    const buildItem = await screen.findByRole("menuitem", { name: /Build/ });
    const planItem = await screen.findByRole("menuitem", { name: /Plan/ });
    const agentItem = await screen.findByRole("menuitem", { name: /Project Copilot/ });

    expect(useAiChatStore.getState().composerMode).toBe("build");
    expect(buildItem).not.toHaveAttribute("data-disabled");
    expect(planItem).not.toHaveAttribute("data-disabled");
    expect(agentItem).not.toHaveAttribute("data-disabled");
  });

  it("toggles web search from the add context menu", async () => {
    const user = userEvent.setup();
    useAiChatStore.setState({ webSearchEnabled: false });
    renderInputActions();

    await user.click(screen.getByRole("button", { name: "Add context" }));
    const webSearchItem = await screen.findByRole("menuitem", { name: "Web search" });

    await user.click(webSearchItem);

    expect(useAiChatStore.getState().webSearchEnabled).toBe(true);
  });
});
