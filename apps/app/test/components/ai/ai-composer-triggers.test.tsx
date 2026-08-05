import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Unstable_Mention } from "@assistant-ui/react";
import {
  agentIdsForComposerScope,
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
} from "@/components/ai/ai-composer-directives";
import { AIComposerTriggers } from "@/components/ai/ai-composer-triggers";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { OVERLAY_LAYER_SHADOW_CLASSNAME } from "@arclayer/ui/layer-shadow";

type MentionAdapterOptions = {
  readonly items?: readonly Unstable_Mention[];
  readonly categories?: readonly {
    id: string;
    label: string;
    items: readonly Unstable_Mention[];
  }[];
  readonly onInserted?: (item: Unstable_Mention) => void;
};

const mentionMocks = vi.hoisted(() => ({
  mentionOptions: null as MentionAdapterOptions | null,
  skillOptions: null as MentionAdapterOptions | null,
  currentScope: "thread" as "thread" | "home",
  popoverOpen: false,
  runConfig: { custom: { existing: "value" } } as { custom?: Record<string, unknown> },
  setRunConfig: vi.fn(),
  setText: vi.fn(),
  onDirectiveInserted: vi.fn(),
  selectCategory: vi.fn(),
  selectItem: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@assistant-ui/react", async () => {
  const React = await import("react");
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const TriggerPopoverBase = ({
    char,
    children,
    className,
  }: {
    char: string;
    children?: ReactNode;
    className?: string;
  }) => React.createElement("div", { className, "data-trigger-char": char }, children);
  const TriggerPopover = Object.assign(TriggerPopoverBase, {
    Directive: () => null,
    Action: () => null,
  });
  const TriggerPopoverItems = ({
    children,
  }: {
    children: (items: readonly Unstable_Mention[]) => ReactNode;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      children([
        {
          id: "agent-1",
          type: "agent",
          label: "Data Analyst",
        },
      ]),
    );
  const TriggerPopoverCategories = ({
    children,
  }: {
    children: (categories: readonly { id: string; label: string }[]) => ReactNode;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      children([
        { id: "agents", label: "Agents" },
        { id: "projects", label: "Projects" },
      ]),
    );

  return {
    ComposerPrimitive: {
      Unstable_TriggerPopover: TriggerPopover,
      Unstable_TriggerPopoverBack: Passthrough,
      Unstable_TriggerPopoverCategories: TriggerPopoverCategories,
      Unstable_TriggerPopoverCategoryItem: Passthrough,
      Unstable_TriggerPopoverItems: TriggerPopoverItems,
      Unstable_TriggerPopoverItem: Passthrough,
    },
    unstable_defaultDirectiveFormatter: {
      serialize: vi.fn(),
      parse: vi.fn(),
    },
    unstable_useMentionAdapter: (options: MentionAdapterOptions) => {
      if (options.categories) mentionMocks.mentionOptions = options;
      else mentionMocks.skillOptions = options;
      return { adapter: {}, directive: {} };
    },
    unstable_useTriggerPopoverScopeContext: () => ({
      open: mentionMocks.popoverOpen,
      highlightedItemId: mentionMocks.popoverOpen ? "trigger-option-agent-1" : undefined,
      categories: [
        { id: "agents", label: "Agents" },
        { id: "projects", label: "Projects" },
      ],
      activeCategoryId: "agents",
      selectCategory: mentionMocks.selectCategory,
      selectItem: mentionMocks.selectItem,
      close: mentionMocks.close,
      items: [
        {
          id: "agent-1",
          type: "agent",
          label: "Data Analyst",
        },
      ],
    }),
    useAui: () => ({
      composer: () => ({
        getState: () => ({ runConfig: mentionMocks.runConfig }),
        setRunConfig: mentionMocks.setRunConfig,
        setText: mentionMocks.setText,
      }),
    }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ai/ai-composer-rich-input", () => ({
  useAIComposerDirectiveInsertion: () => ({
    onDirectiveInserted: mentionMocks.onDirectiveInserted,
  }),
}));

vi.mock("@/components/ai/ai-composer-skill-menu", () => ({
  useEnabledAIComposerSkills: () => ({
    isError: false,
    isLoading: false,
    skills: [
      {
        id: "installation-1",
        slug: "commerce-skill",
        label: "Commerce Skill",
        description: "Create commerce content",
      },
      {
        id: "installation-skill-creator",
        slug: "skill-creator",
        label: "Skill Creator",
        description: "Create reusable Skills",
        command: "skill-creator",
      },
    ],
  }),
}));

const AGENT_ID = "A1b2C3d4E5f6G7h8I9j0K1";

function renderTriggers(
  props: ComponentProps<typeof AIComposerTriggers> & { scope?: "thread" | "home" },
) {
  const { scope = "thread", ...triggerProps } = props;
  mentionMocks.currentScope = scope;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "Scroll left", scrollRightAriaLabel: "Scroll right" }}
        userReducedMotion
      >
        <SettingsScreenProvider>
          <div data-ai-composer-shell data-testid="composer-shell">
            <textarea aria-label="Composer input" />
            <AIComposerTriggers {...triggerProps} />
          </div>
        </SettingsScreenProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

describe("AIComposerTriggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mentionMocks.mentionOptions = null;
    mentionMocks.skillOptions = null;
    mentionMocks.popoverOpen = false;
    mentionMocks.runConfig = { custom: { existing: "value" } };
    mentionMocks.setRunConfig.mockImplementation((runConfig) => {
      mentionMocks.runConfig = runConfig as { custom?: Record<string, unknown> };
    });
    mentionMocks.onDirectiveInserted.mockImplementation((item: Unstable_Mention) => {
      if (
        item.type !== "agent" &&
        item.type !== "skill" &&
        item.type !== "project" &&
        item.type !== "asset" &&
        item.type !== "content"
      ) {
        return;
      }
      const metadata = item.metadata as Record<string, unknown> | undefined;
      const command = typeof metadata?.command === "string" ? metadata.command : undefined;
      const scope = mentionMocks.currentScope;
      useAIComposerDirectiveStore.getState().addDirectives(scope, [
        {
          type: item.type,
          id: item.id,
          label: item.label,
          ...(command ? { command } : {}),
        },
      ]);
      const current = mentionMocks.runConfig;
      if (item.type === "agent") {
        mentionMocks.setRunConfig({
          ...current,
          custom: {
            ...current.custom,
            mentionedAgentIds: [...agentIdsForComposerScope(scope)],
          },
        });
      }
      if (item.type === "skill") {
        mentionMocks.setRunConfig({
          ...current,
          custom: {
            ...current.custom,
            selectedSkillInstallationIds: [...skillInstallationIdsForComposerScope(scope)],
          },
        });
      }
    });
    mentionMocks.selectCategory.mockReset();
    useAIComposerDirectiveStore.getState().clearDirectives("thread");
    useAIComposerDirectiveStore.getState().clearDirectives("home");
    useAuthStore.setState({ accessToken: null, sessionVersion: 0 });
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      currentProjectId: null,
      lastProjectId: null,
    });
  });

  it("registers an Agent only after assistant-ui reports a real mention insertion", () => {
    renderTriggers({ scope: "thread" });
    const agent: Unstable_Mention = {
      id: AGENT_ID,
      type: "agent",
      label: "Data Analyst",
    };

    expect(agentIdsForComposerScope("thread")).toEqual([]);
    act(() => mentionMocks.mentionOptions?.onInserted?.(agent));

    expect(agentIdsForComposerScope("thread")).toEqual([AGENT_ID]);
    expect(mentionMocks.setRunConfig).toHaveBeenCalledWith({
      custom: { existing: "value", mentionedAgentIds: [AGENT_ID] },
    });
  });

  it("keeps home and thread mention trust isolated", () => {
    renderTriggers({ scope: "home" });
    const agent: Unstable_Mention = {
      id: AGENT_ID,
      type: "agent",
      label: "Data Analyst",
    };

    act(() => mentionMocks.mentionOptions?.onInserted?.(agent));

    expect(agentIdsForComposerScope("home")).toEqual([AGENT_ID]);
    expect(agentIdsForComposerScope("thread")).toEqual([]);
  });

  it("adds enabled workspace Skills to the slash directive adapter as installation IDs", () => {
    renderTriggers({ scope: "home" });

    expect(mentionMocks.skillOptions?.items).toContainEqual({
      id: "installation-1",
      type: "skill",
      label: "Commerce Skill",
      description: "Create commerce content",
      icon: "skill",
    });

    act(() =>
      mentionMocks.skillOptions?.onInserted?.({
        id: "installation-1",
        type: "skill",
        label: "Commerce Skill",
      }),
    );
    expect(useAIComposerDirectiveStore.getState().directivesByScope.home).toEqual([
      {
        type: "skill",
        id: "installation-1",
        label: "Commerce Skill",
      },
    ]);
    expect(skillInstallationIdsForComposerScope("home")).toEqual(["installation-1"]);
    expect(mentionMocks.setRunConfig).toHaveBeenCalledWith({
      custom: { existing: "value", selectedSkillInstallationIds: ["installation-1"] },
    });
    expect(mentionMocks.setText).not.toHaveBeenCalled();
  });

  it("keeps Agent and selected Skill IDs together in the composer Run config", () => {
    renderTriggers({ scope: "thread" });
    const agent: Unstable_Mention = {
      id: AGENT_ID,
      type: "agent",
      label: "Data Analyst",
    };

    act(() => mentionMocks.mentionOptions?.onInserted?.(agent));
    act(() =>
      mentionMocks.skillOptions?.onInserted?.({
        id: "installation-1",
        type: "skill",
        label: "Commerce Skill",
      }),
    );

    expect(mentionMocks.setRunConfig).toHaveBeenLastCalledWith({
      custom: {
        existing: "value",
        mentionedAgentIds: [AGENT_ID],
        selectedSkillInstallationIds: ["installation-1"],
      },
    });
  });

  it("adds asset and content mention tabs only when a project is active", () => {
    renderTriggers({ scope: "home" });

    expect(mentionMocks.mentionOptions?.categories?.map((category) => category.id)).toEqual([
      "agents",
      "projects",
    ]);

    useWorkspaceStore.setState({ currentProjectId: "project-1" });
    renderTriggers({ scope: "thread" });

    expect(mentionMocks.mentionOptions?.categories?.map((category) => category.id)).toEqual([
      "agents",
      "projects",
      "assets",
      "content",
    ]);
  });

  it("keeps mention and slash menu chrome hidden until a trigger is open", () => {
    const view = renderTriggers({ scope: "home" });

    expect(screen.queryByText("AI_CHAT_MENTION_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("AI_CHAT_SKILL_ENABLED_TITLE")).not.toBeInTheDocument();

    mentionMocks.popoverOpen = true;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ChromeTabsProvider
          labels={{ scrollLeftAriaLabel: "Scroll left", scrollRightAriaLabel: "Scroll right" }}
          userReducedMotion
        >
          <SettingsScreenProvider>
            <div data-ai-composer-shell data-testid="composer-shell">
              <AIComposerTriggers />
            </div>
          </SettingsScreenProvider>
        </ChromeTabsProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("AI_CHAT_MENTION_TITLE")).not.toBeInTheDocument();
    expect(screen.getByText("AI_CHAT_SKILL_ENABLED_TITLE")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agents" })).toHaveClass("py-2", "text-caption!");
    expect(document.querySelector('[data-trigger-char="@"]')).toHaveClass("overflow-hidden");
    expect(document.querySelector('[data-trigger-char="@"]')).toHaveClass(
      ...OVERLAY_LAYER_SHADOW_CLASSNAME.split(" "),
    );
    expect(document.querySelector('[data-trigger-char="/"]')).toHaveClass(
      ...OVERLAY_LAYER_SHADOW_CLASSNAME.split(" "),
    );
    expect(document.querySelector('[data-trigger-char="@"]')).not.toHaveClass("shadow-lg");
    expect(document.querySelector('[data-trigger-char="@"]')).not.toHaveClass("overflow-y-auto");
    const scrollRegions = document.querySelectorAll<HTMLElement>(
      '[data-slot="composer-trigger-scroll-region"]',
    );
    expect(scrollRegions).toHaveLength(2);
    for (const scrollRegion of scrollRegions) {
      expect(scrollRegion).toHaveClass(
        "min-h-0",
        "min-w-0",
        "flex-1",
        "overflow-y-auto",
        "overscroll-contain",
      );
    }
    expect(document.querySelector('[data-slot="scroll-area"]')).not.toBeInTheDocument();
    const skillFooter = screen.getByRole("button", { name: "AI_CHAT_SKILL_ADD" });
    expect(skillFooter).toHaveClass("shrink-0");
    expect(skillFooter.previousElementSibling).toHaveAttribute(
      "data-slot",
      "composer-trigger-scroll-region",
    );
    expect(screen.getByTestId("composer-shell")).toHaveAttribute("data-trigger-open", "true");

    mentionMocks.popoverOpen = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ChromeTabsProvider
          labels={{ scrollLeftAriaLabel: "Scroll left", scrollRightAriaLabel: "Scroll right" }}
          userReducedMotion
        >
          <SettingsScreenProvider>
            <div data-ai-composer-shell data-testid="composer-shell">
              <AIComposerTriggers />
            </div>
          </SettingsScreenProvider>
        </ChromeTabsProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("composer-shell")).not.toHaveAttribute("data-trigger-open");
  });

  it("selects the installed Skill Creator through the same slash directive path", async () => {
    const user = userEvent.setup();
    mentionMocks.popoverOpen = true;
    renderTriggers({ scope: "home" });

    await user.click(screen.getByRole("button", { name: "AI_CHAT_SKILL_ADD" }));
    await user.click(screen.getByRole("button", { name: /AI_CHAT_SKILL_CREATE_WITH_ARCLAYER/ }));

    expect(mentionMocks.selectItem).toHaveBeenCalledWith({
      type: "skill",
      id: "installation-skill-creator",
      label: "Skill Creator",
      description: "Create reusable Skills",
      metadata: { command: "skill-creator" },
    });
    expect(mentionMocks.setText).not.toHaveBeenCalled();
    expect(mentionMocks.close).not.toHaveBeenCalled();
  });

  it("switches mention tabs with the horizontal arrow keys", async () => {
    const user = userEvent.setup();
    mentionMocks.popoverOpen = true;
    renderTriggers({ scope: "home" });

    screen.getByRole("textbox", { name: "Composer input" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(mentionMocks.selectCategory).toHaveBeenCalledWith("projects");
  });
});
