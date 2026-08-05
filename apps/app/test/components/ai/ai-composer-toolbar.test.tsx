import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIProjectAgents } from "@/api/ai";
import {
  AIComposerContextControls,
  AIComposerInputActions,
  AIComposerToolbar,
} from "@/components/ai/ai-composer-toolbar";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/ai", () => ({
  listAIProjectAgents: vi.fn(),
}));

vi.mock("@/components/ai/ai-model-selector", () => ({
  AIModelSelector: ({ iconOnly }: { iconOnly?: boolean }) => (
    <div data-testid="ai-model-selector" data-icon-only={String(Boolean(iconOnly))} />
  ),
}));

vi.mock("@/components/ai/ai-agent-selector", () => ({
  AIProjectSelector: () => <div data-testid="ai-project-selector" />,
}));

vi.mock("@/components/ai/ai-composer-skill-menu", () => ({
  AIComposerSkillMenu: ({ iconOnly, scope }: { iconOnly?: boolean; scope?: string }) => (
    <div
      data-testid="ai-skill-selector"
      data-icon-only={String(Boolean(iconOnly))}
      data-scope={scope}
    />
  ),
}));

vi.mock("@arclayer/ui/dropdown-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/ui/dropdown-menu")>();
  const ActualDropdownMenuContent = actual.DropdownMenuContent;

  return {
    ...actual,
    DropdownMenuContent: ({
      collisionPadding,
      ...props
    }: ComponentProps<typeof ActualDropdownMenuContent>) => (
      <ActualDropdownMenuContent
        data-collision-padding={String(collisionPadding)}
        collisionPadding={collisionPadding}
        {...props}
      />
    ),
  };
});

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

function renderHomeToolbar() {
  return render(<AIComposerToolbar surface="home" />);
}

function renderSidebarToolbar() {
  return render(<AIComposerToolbar surface="sidebar" />);
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

    await user.click(screen.getByRole("button", { name: "Select work mode" }));

    const buildItem = await screen.findByRole("menuitem", { name: /Build/ });
    const planItem = await screen.findByRole("menuitem", { name: /Plan/ });

    expect(screen.getByRole("menu")).toHaveAttribute("data-collision-padding", "16");
    expect(useAiChatStore.getState().composerMode).toBe("build");
    expect(buildItem).not.toHaveAttribute("data-disabled");
    expect(planItem).not.toHaveAttribute("data-disabled");
    expect(screen.queryByRole("menuitem", { name: /Project Copilot/ })).not.toBeInTheDocument();
    expect(listAIProjectAgents).not.toHaveBeenCalled();
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

  it("groups add, project, and Skill left of model, mode, and send on Home", () => {
    const { container } = renderHomeToolbar();
    const groups = container.querySelectorAll(".aui-composer-action-wrapper > div");
    const leftGroup = groups[0] as HTMLElement;
    const rightGroup = groups[1] as HTMLElement;
    const addButton = within(leftGroup).getByRole("button", { name: "Add context" });
    const projectSelector = within(leftGroup).getByTestId("ai-project-selector");
    const skillSelector = within(leftGroup).getByTestId("ai-skill-selector");
    const modelSelector = within(rightGroup).getByTestId("ai-model-selector");
    const modeButton = within(rightGroup).getByRole("button", { name: "Select work mode" });

    expect(leftGroup.children).toHaveLength(3);
    expect(leftGroup.children[0]).toContainElement(addButton);
    expect(leftGroup.children[1]).toContainElement(projectSelector);
    expect(leftGroup.children[2]).toContainElement(skillSelector);
    expect(skillSelector).toHaveAttribute("data-scope", "home");
    expect(skillSelector).toHaveAttribute("data-icon-only", "false");
    expect(modelSelector).toHaveAttribute("data-icon-only", "false");
    expect(modeButton).toHaveTextContent("Build");
    expect(rightGroup.children[0]).toContainElement(modelSelector);
    expect(rightGroup.children[1]).toContainElement(modeButton);
    expect(rightGroup.lastElementChild).toHaveClass("flex", "shrink-0");
  });

  it("keeps the sidebar toolbar on one row without a project-selection prompt", () => {
    const { container } = renderSidebarToolbar();
    const toolbar = container.querySelector(".aui-composer-action-wrapper") as HTMLElement;
    const addButton = within(toolbar).getByRole("button", { name: "Add context" });
    const modelSelector = within(toolbar).getByTestId("ai-model-selector");
    const skillSelector = within(toolbar).getByTestId("ai-skill-selector");
    const modeButton = within(toolbar).getByRole("button", { name: "Select work mode" });

    expect(within(toolbar).queryByTestId("ai-project-selector")).not.toBeInTheDocument();
    expect(toolbar.children[0]).toContainElement(addButton);
    expect(toolbar.children[1]).toContainElement(modelSelector);
    expect(toolbar.children[2]).toContainElement(skillSelector);
    expect(skillSelector).toHaveAttribute("data-scope", "thread");
    expect(skillSelector).toHaveAttribute("data-icon-only", "true");
    expect(modelSelector).toHaveAttribute("data-icon-only", "true");
    expect(toolbar.children[4]).toContainElement(modeButton);
    expect(modeButton).toHaveClass("w-8", "px-0");
    expect(modeButton).not.toHaveTextContent("Build");
    expect(modeButton).toHaveAttribute("title", "Build");
    expect(toolbar.lastElementChild).toHaveClass("flex", "shrink-0");
  });
});
