import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppendMessage, ExternalThreadQueueAdapter } from "@assistant-ui/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjects } from "@/api/projects";
import { HomePage } from "@/pages/home/page";
import {
  SettingsScreenProvider,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";
import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";
import { AUTO_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAIEntryStore } from "@/stores/use-ai-entry-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

type ProjectListItem = Awaited<ReturnType<typeof listProjects>>["items"][number];

const { navigateMock, searchMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  searchMock: vi.fn(),
}));

const assistantUiMockState = vi.hoisted(() => ({
  composerText: "",
  runtimeStore: null as null | {
    onCancel?: () => Promise<void>;
    onNew?: (message: AppendMessage) => Promise<void>;
    queue?: ExternalThreadQueueAdapter;
  },
}));

const viewportMockState = vi.hoisted(() => ({ isMobile: false }));

const COORDINATOR_AGENT_ID = "tLTD4kqITA2PGQobLD1OAQ";
const DATA_ANALYST_AGENT_ID = "tLTD4kqITA2PGQobLD1OBg";
const CONTENT_SKILL_INSTALLATION_ID = "installation-content";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchMock(),
}));

vi.mock("@arclayer/hooks/use-is-mobile", () => ({
  useIsMobile: () => viewportMockState.isMobile,
}));

vi.mock("@assistant-ui/react", async () => {
  const actual = await vi.importActual<typeof import("@assistant-ui/react")>("@assistant-ui/react");
  const React = await import("react");
  const createAppendTextMessage = (text: string): AppendMessage => ({
    role: "user",
    content: [{ type: "text", text }],
    attachments: [],
    createdAt: new Date(),
    parentId: null,
    sourceId: null,
    runConfig: undefined,
    metadata: { custom: {} },
  });

  return {
    ...actual,
    AssistantRuntimeProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
    AuiIf: ({
      children,
      condition: _condition,
    }: {
      children?: ReactNode;
      condition?: (state: {
        thread: { isRunning: boolean; capabilities: { dictation: boolean } };
        composer: { dictation: null; isEmpty: boolean };
      }) => boolean;
    }) => <>{children}</>,
    CompositeAttachmentAdapter: class CompositeAttachmentAdapter {
      constructor(public adapters: unknown[]) {}
    },
    ComposerPrimitive: {
      AddAttachment: ({ children }: { children?: ReactNode }) => <>{children}</>,
      AttachmentDropzone: ({ children }: { children?: ReactNode }) => <>{children}</>,
      Attachments: () => null,
      Cancel: ({ children }: { children?: ReactNode }) => <>{children}</>,
      Dictate: ({ children }: { children?: ReactNode }) => <>{children}</>,
      Unstable_TriggerPopoverRoot: ({ children }: { children?: ReactNode }) => <>{children}</>,
      Input: React.forwardRef<
        HTMLTextAreaElement,
        React.TextareaHTMLAttributes<HTMLTextAreaElement>
      >((props, ref) => (
        <textarea
          {...props}
          ref={ref}
          value={assistantUiMockState.composerText}
          onChange={(event) => {
            assistantUiMockState.composerText = event.target.value;
            props.onChange?.(event);
          }}
        />
      )),
      Root: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      Send: ({ children }: { children?: React.ReactElement }) =>
        React.isValidElement(children)
          ? React.cloneElement(children, {
              onClick: () =>
                assistantUiMockState.runtimeStore?.onNew?.(
                  createAppendTextMessage(assistantUiMockState.composerText),
                ),
            } as React.HTMLAttributes<HTMLElement>)
          : children,
      StopDictation: ({ children }: { children?: ReactNode }) => <>{children}</>,
    },
    SimpleTextAttachmentAdapter: class SimpleTextAttachmentAdapter {},
    WebSpeechDictationAdapter: {
      isSupported: () => false,
    },
    useAssistantRuntime: () => null,
    useAui: () => ({
      composer: () => ({
        setText: (text: string) => {
          assistantUiMockState.composerText = text;
        },
      }),
    }),
    useAuiState: (selector: (state: { composer: { text: string } }) => unknown) =>
      selector({ composer: { text: assistantUiMockState.composerText } }),
    unstable_useTriggerPopoverTriggers: () => new Map(),
    useExternalStoreRuntime: (store: unknown) => {
      assistantUiMockState.runtimeStore = store as typeof assistantUiMockState.runtimeStore;
      return store;
    },
  };
});

vi.mock("@/components/assistant-ui/composer-queue", () => ({
  ComposerQueue: () => null,
}));

vi.mock("@/components/ai/ai-composer-triggers", () => ({
  AIComposerTriggers: () => null,
}));

vi.mock("@/components/ai/ai-composer-directive-chips", () => ({
  AIComposerDirectiveSync: () => null,
  AIComposerDirectiveChips: () => <span data-testid="composer-chip-group-web-search" />,
}));

vi.mock("@/components/ai/ai-composer-rich-input", async () => {
  const React = await import("react");
  return {
    AIComposerDirectiveInsertionProvider: ({ children }: { children?: ReactNode }) => (
      <>{children}</>
    ),
    AIComposerRichInput: React.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >((props, ref) => (
      <textarea
        {...props}
        ref={ref}
        value={assistantUiMockState.composerText}
        onChange={(event) => {
          assistantUiMockState.composerText = event.target.value;
          props.onChange?.(event);
        }}
      />
    )),
  };
});

vi.mock("@/components/ai/ai-suggestions", () => ({
  AI_CHAT_SUGGESTIONS: [],
  AISuggestions: () => <div data-testid="home-ai-suggestions" />,
}));

vi.mock("@/components/ai/ai-composer-entry", () => ({
  applyWebSearchDirective: (text: string) => text,
  appendMessageToText: (message: Pick<AppendMessage, "content" | "attachments">) => {
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content
            .map((part) => (part.type === "text" ? part.text : ""))
            .filter(Boolean)
            .join("");
    const attachments = (message.attachments ?? [])
      .flatMap((attachment) => attachment.content ?? [])
      .map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n\n");
    return [content, attachments].filter((part) => part.trim()).join("\n\n");
  },
  createAIChatAttachmentAdapter: () => undefined,
  projectIdFromComposerDirective: (text: string) =>
    /:project\[[^\]\n]{1,1024}\]\{name=([^}\n]{1,1024})\}/u.exec(text)?.[1]?.trim() ?? null,
}));

vi.mock("@/api/ai", () => ({
  AI_AGENT_PROJECT_CONTEXT_REQUIRED: "AI_AGENT_PROJECT_CONTEXT_REQUIRED",
  formatAIChatError: (error: unknown) =>
    error instanceof Error && error.message === "AI_AGENT_PROJECT_CONTEXT_REQUIRED"
      ? "Agent 模式需要先进入一个项目。规划和构建模式可在工作区首页直接使用。"
      : error instanceof Error
        ? error.message
        : "Request failed",
  listAIProjectAgents: vi.fn(async () => ({
    agents: [
      {
        agentId: COORDINATOR_AGENT_ID,
        name: "Content Builder",
        description: "Build content blueprints",
        mode: "build",
        skillId: "content.build",
        toolNames: [],
        readOnly: true,
        requiresApproval: false,
      },
    ],
    skills: [],
    tools: [],
  })),
}));

vi.mock("@/api/projects", () => ({
  listProjects: vi.fn(),
}));

vi.mock("@/components/ai/ai-model-selector", () => ({
  AIModelSelector: () => <div data-testid="ai-model-selector" />,
}));

vi.mock("@/components/ai/ai-agent-selector", () => ({
  AIProjectSelector: () => <div data-testid="ai-project-selector" />,
}));

vi.mock("@/components/ai/ai-composer-skill-menu", () => ({
  AIComposerSkillMenu: () => <div data-testid="ai-skill-selector" />,
}));

vi.mock("@/components/Aurora", () => ({
  default: ({ colorStops }: { colorStops: [string, string, string] }) => (
    <div data-testid="aurora-canvas" data-color-stops={JSON.stringify(colorStops)} />
  ),
}));

vi.mock("@/components/layout/admin-logo", () => ({
  AdminLogo: ({ ariaLabel }: { ariaLabel: string }) => (
    <div aria-label={ariaLabel} data-testid="home-brand-logo" />
  ),
}));

vi.mock("@/components/common/admin-masonry-grid", async () => {
  return {
    AdminMasonryGrid: ({
      items,
      render: Render,
      columnCount,
    }: {
      items: Array<{ key: string }>;
      render: ComponentType<{ data: { key: string }; index: number; width: number }>;
      columnCount?: number;
    }) => (
      <div data-testid="admin-masonry-grid" data-column-count={columnCount}>
        {items.map((item, index) => (
          <Render key={item.key} data={item} index={index} width={260} />
        ))}
      </div>
    ),
    getAdminMasonryDatasetKey: (baseKey: string, orderedIds: readonly string[]) =>
      `${baseKey}:${orderedIds.join("|")}`,
    resolveAdminMasonryScrollViewport: () => ({ kind: "window" as const }),
  };
});

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const authState = {
  accessToken: null as string | null,
  sessionVersion: 0,
};

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (
    selector: (state: { accessToken: string | null; sessionVersion: number }) => unknown,
  ) => selector(authState),
}));

const workspaceState = {
  currentWorkspaceId: null as string | null,
  lastWorkspaceId: null as string | null,
  currentProjectId: null as string | null,
  lastProjectId: null as string | null,
  setCurrentWorkspaceId: vi.fn(),
  setCurrentProjectId: vi.fn(),
};

type WorkspaceSelector = (state: {
  currentWorkspaceId: string | null;
  lastWorkspaceId: string | null;
  currentProjectId: string | null;
  lastProjectId: string | null;
  setCurrentWorkspaceId: (workspaceId: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
}) => unknown;

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: Object.assign((selector: WorkspaceSelector) => selector(workspaceState), {
    getState: () => workspaceState,
  }),
}));

const labels: Record<string, string> = {
  "auth:SLOGAN_TITLE": "Arclayer",
  "ai:AI_CHAT_HOME_PRODUCT_PROMISE": "让内容构建更简单",
  "ai:AI_CHAT_HOME_PRODUCT_SUBTITLE": "从想法到发布，用 AI 完成内容与网站构建。",
  "ai:AI_CHAT_HOME_USER_FALLBACK": "朋友",
  "ai:AI_CHAT_HOME_GREETING": "How can I help you today, 朋友?",
  "ai:AI_CHAT_HOME_SUBTITLE": "从一个问题开始",
  "ai:AI_CHAT_HOME_NEW_TITLE": "新对话",
  "ai:AI_CHAT_HOME_NEW_DESC": "准备一个新问题",
  "ai:AI_CHAT_HOME_PROJECTS_TITLE": "最近项目",
  "ai:AI_CHAT_HOME_PROJECTS_DESC": "回到项目列表",
  "ai:AI_CHAT_HOME_INSPIRATION_TITLE": "灵感发现",
  "ai:AI_CHAT_HOME_INSPIRATION_DESC": "让 AI 给出方向",
  "ai:AI_CHAT_HOME_INSPIRATION_PROMPT": "给我一些灵感",
  "ai:AI_CHAT_HOME_INSPIRATION_SEE_ALL": "查看全部",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_ALL": "全部",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_LANDING": "落地页",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_COMMERCE": "电商",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_CONTENT": "内容",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_PORTFOLIO": "作品集",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_DOCS": "文档",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_EVENTS": "活动",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_REAL_ESTATE": "地产",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_NAME": "Editorial Studio",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_DESC": "为品牌观点设计的首页。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_SAAS_LAUNCH_NAME": "SaaS Launch Desk",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_SAAS_LAUNCH_DESC": "面向 B2B 产品发布。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_NAME": "Architecture Index",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_DESC": "适合建筑事务所。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_NAME": "Hospitality Room Book",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_DESC": "适合酒店和民宿。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_WORKSPACE_HUB_NAME": "Workspace Hub",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_WORKSPACE_HUB_DESC": "组织服务和案例。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_NAME": "Commerce Atelier",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_DESC": "适合设计师品牌。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_AGENCY_REPORT_NAME": "Agency Report",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_AGENCY_REPORT_DESC": "展示洞察与方法论。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_NAME": "Travel Journal",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_DESC": "沉浸式游记结构。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_CITY_EVENTS_NAME": "City Events Board",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_CITY_EVENTS_DESC": "组织活动日程。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_REAL_ESTATE_NAME": "Real Estate Showcase",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_REAL_ESTATE_DESC": "承载地产项目。",
  "ai:AI_CHAT_INPUT_PLACEHOLDER": "询问 AI…",
  "ai:AI_CHAT_PLACEHOLDER_CREATE_SITE": "描述你想搭建的网站、页面或内容结构…",
  "ai:AI_CHAT_PLACEHOLDER_REVIEW_PROJECT": "让我检查当前项目的发布准备…",
  "ai:AI_CHAT_PLACEHOLDER_MENTION_AGENT": "输入 @ 邀请 Agent 一起分析…",
  "ai:AI_CHAT_PLACEHOLDER_COMMAND_OR_SKILL": "输入 / 选择命令或已启用 Skill…",
  "ai:AI_CHAT_PLACEHOLDER_BRAND_DIRECTION": "从品牌方向开始，生成页面与内容方案…",
  "ai:AI_CHAT_PLACEHOLDER_PROJECT_CONTEXT": "选择项目，让建议带上真实上下文…",
  "ai:AI_CHAT_HOME_STARTER_WEBSITE": "网站搭建",
  "ai:AI_CHAT_HOME_STARTER_CONTENT": "内容运营",
  "ai:AI_CHAT_HOME_STARTER_BRAND": "品牌设计",
  "ai:AI_CHAT_HOME_STARTER_COMMERCE": "电商内容",
  "ai:AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_1": "官网改版提示词",
  "ai:AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_2": "落地页提示词",
  "ai:AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_3": "内容站提示词",
  "ai:AI_CHAT_SEND": "发送",
  "ai:AI_CHAT_VOICE_INPUT": "语音输入",
  "ai:AI_CHAT_STOP_VOICE_INPUT": "停止语音输入",
  "ai:AI_CHAT_VOICE_UNSUPPORTED": "当前浏览器不支持语音输入。",
  "ai:AI_CHAT_HOME_RECENT_PROJECTS": "最近项目",
  "ai:AI_CHAT_HOME_SEE_ALL_PROJECTS": "查看全部",
  "ai:AI_CHAT_HOME_PROJECT_UPDATED_AT": "更新于 2026-06-01 12:00",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "ai:AI_CHAT_HOME_GREETING") {
        return `How can I help you today, ${String(options?.name ?? "朋友")}?`;
      }
      return labels[key] ?? labels[`ai:${key}`] ?? labels[`auth:${key}`] ?? key;
    },
  }),
}));

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewportMockState.isMobile = false;
    searchMock.mockReturnValue({});
    authState.accessToken = null;
    authState.sessionVersion = 0;
    workspaceState.currentWorkspaceId = null;
    workspaceState.lastWorkspaceId = null;
    workspaceState.currentProjectId = null;
    workspaceState.lastProjectId = null;
    workspaceState.setCurrentWorkspaceId.mockReset();
    workspaceState.setCurrentProjectId.mockReset();
    vi.mocked(listProjects).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 4,
      pages: 1,
      next: null,
      prev: null,
    });
    assistantUiMockState.composerText = "";
    assistantUiMockState.runtimeStore = null;
    useAIEntryStore.setState({ entries: [] });
    usePreferencesStore.setState({ reduceMotion: false });
    useAIComposerDirectiveStore.setState({
      directivesByScope: { thread: [], home: [] },
    });
    useAiChatStore.setState({
      selectedModel: AUTO_AI_CHAT_MODEL,
      selectedReasoningEffort: "medium",
      composerMode: "build",
      selectedAgentId: COORDINATOR_AGENT_ID,
      drawerOpen: false,
    });
  });

  function renderHomePage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    return render(
      <main data-slot="sidebar-inset">
        <QueryClientProvider client={queryClient}>
          <SettingsScreenProvider>
            <HomePage />
            <SettingsStateProbe />
          </SettingsScreenProvider>
        </QueryClientProvider>
      </main>,
    );
  }

  function SettingsStateProbe() {
    const { state } = useSettingsScreen();
    return (
      <output data-testid="settings-state">
        {JSON.stringify({ open: state.open, screen: state.screen, section: state.section })}
      </output>
    );
  }

  it("opens the account danger section from a typed cross-application search target", async () => {
    searchMock.mockReturnValue({ settings: "personal.profile", section: "danger" });

    renderHomePage();

    await waitFor(() =>
      expect(screen.getByTestId("settings-state")).toHaveTextContent(
        '"open":true,"screen":"personal.profile","section":"danger"',
      ),
    );
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/",
      search: {},
      replace: true,
    });
  });

  it("renders the Home entry surface without a legacy conversation state", () => {
    const { container } = renderHomePage();

    expect(screen.getByRole("heading", { name: "Arclayer 让内容构建更简单" })).toBeInTheDocument();
    expect(screen.getByText("从想法到发布，用 AI 完成内容与网站构建。")).toBeInTheDocument();
    const aurora = screen.getByTestId("home-ai-aurora");
    expect(aurora).toBeInTheDocument();
    expect(aurora).toHaveClass("sticky", "top-0", "z-0", "-mb-[100dvh]", "h-[100dvh]");
    expect(aurora).not.toHaveClass("-mb-[calc(100svh-4rem)]", "h-[calc(100svh-4rem)]");
    expect(aurora.closest('[data-slot="admin-route-frame"]')).not.toBeNull();
    expect(aurora.querySelector('[data-slot="home-aurora-viewport"]')).toHaveClass(
      "relative",
      "h-full",
      "overflow-hidden",
    );
    expect(container.querySelector('[data-page="ai-home"]')).toHaveClass("relative", "z-10");
    expect(aurora.querySelector('[data-slot="home-aurora-edge-glow"]')).toHaveClass(
      "bottom-0",
      "h-[clamp(16rem,42svh,28rem)]",
    );
    expect(aurora.querySelector('[data-slot="home-aurora-canvas"]')).toHaveClass(
      "bottom-0",
      "h-[clamp(16rem,42svh,28rem)]",
    );
    expect(screen.getByTestId("aurora-canvas")).toHaveAttribute(
      "data-color-stops",
      JSON.stringify(["#339cff", "#526477", "#339cff"]),
    );
    const composerShell = screen
      .getByRole("textbox", { name: "询问 AI…" })
      .closest("[data-ai-composer-shell]");
    expect(composerShell).toHaveClass(
      "border-border/60",
      "hover:border-border",
      "focus-within:ring-1",
    );
    expect(container.querySelector("[data-ai-composer-input-row]")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "询问 AI…" })).toBeInTheDocument();
    expect(screen.getByTestId("composer-chip-group-web-search")).toBeInTheDocument();
    expect(container.querySelector(".aui-composer-attachments")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-ai-prompt-starters")).toBeInTheDocument();
    expect(screen.getByTestId("home-inspiration-section")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="home-ai-entry"]')).toHaveClass(
      "min-h-[clamp(28rem,calc(100svh_-_18rem),72rem)]",
    );
    expect(useAiChatStore.getState()).not.toHaveProperty("conversations");
  });

  it("expands a Home prompt category and fills the composer without submitting", async () => {
    const user = userEvent.setup();
    renderHomePage();

    const categoryButton = screen.getByRole("button", { name: /网站搭建/ });
    expect(categoryButton).toHaveClass("w-auto", "!rounded-md", "bg-card", "dark:bg-card");
    expect(categoryButton).not.toHaveClass("w-full", "backdrop-blur-sm");
    await user.click(categoryButton);
    const contentCategoryButton = screen.getByRole("button", { name: /内容运营/ });
    await user.click(contentCategoryButton);
    expect(document.querySelectorAll('[data-slot="home-ai-starter-options"]')).toHaveLength(1);
    await user.click(categoryButton);

    let promptButton = screen.getByRole("button", { name: "官网改版提示词" });
    const animatedOptions = promptButton.closest('[data-slot="home-ai-starter-options"]');
    expect(animatedOptions).toHaveClass("relative", "overflow-hidden");
    expect(animatedOptions).not.toHaveClass("absolute");
    expect(promptButton.parentElement).toHaveClass("pt-3");
    expect(promptButton).toHaveClass("rounded-md", "bg-popover");

    act(() => usePreferencesStore.setState({ reduceMotion: true }));
    promptButton = screen.getByRole("button", { name: "官网改版提示词" });
    expect(promptButton.closest('[data-slot="home-ai-starter-options"]')).not.toBe(animatedOptions);
    await user.click(promptButton);

    expect(assistantUiMockState.composerText).toBe("官网改版提示词");
    expect(useAIEntryStore.getState().entries).toEqual([]);
  });

  it("opens the Drawer and submits the first prompt to the normalized Agent entry queue", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我总结今天的任务" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries.map((entry) => entry.prompt)).toEqual([
        "帮我总结今天的任务",
      ]);
    });
    const state = useAiChatStore.getState();
    expect(state.drawerOpen).toBe(true);
    expect(state).not.toHaveProperty("conversations");
    expect(state).not.toHaveProperty("activeId");
  });

  it("routes home project creation prompts through the normalized Build Agent", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "build" });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我创建一个随机项目" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries[0]?.prompt).toBe("帮我创建一个随机项目");
    });
    expect(useAiChatStore.getState().composerMode).toBe("build");
    expect(workspaceState.setCurrentWorkspaceId).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("keeps home project creation prompts in the normalized Plan Agent mode", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "plan" });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我创建一个随机项目" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries[0]?.prompt).toBe("帮我创建一个随机项目");
    });
    expect(useAiChatStore.getState().composerMode).toBe("plan");
  });

  it("queues a workspace-scoped prompt without inventing a project fallback", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "build" });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我构建内容计划" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries[0]?.prompt).toBe("帮我构建内容计划");
    });
    const state = useAiChatStore.getState();
    expect(state.drawerOpen).toBe(true);
    expect(workspaceState.setCurrentProjectId).not.toHaveBeenCalled();
  });

  it("queues repeated Agent prompts for the normalized Drawer runtime", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "build", selectedAgentId: COORDINATOR_AGENT_ID });
    renderHomePage();

    for (const prompt of ["先生成内容结构", "继续生成字段说明"]) {
      fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
        target: { value: prompt },
      });
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    }

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries.map((entry) => entry.prompt)).toEqual([
        "先生成内容结构",
        "继续生成字段说明",
      ]);
    });
    expect(useAiChatStore.getState().drawerOpen).toBe(true);
  });

  it("uses a project directive as normalized Agent context without creating a legacy conversation", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "build", selectedAgentId: COORDINATOR_AGENT_ID });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: ":project[Project One]{name=project-1} 帮我构建内容计划" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries[0]?.prompt).toBe("帮我构建内容计划");
    });
    expect(workspaceState.setCurrentProjectId).toHaveBeenCalledWith("project-1");
    expect(useAiChatStore.getState().drawerOpen).toBe(true);
    expect(useAiChatStore.getState().selectedAgentId).toBe(COORDINATOR_AGENT_ID);
    expect(screen.queryByText(/Agent 模式需要先进入一个项目/)).not.toBeInTheDocument();
  });

  it("forwards Home Agent and Skill selections as structured Run IDs without changing user text", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "plan", selectedAgentId: COORDINATOR_AGENT_ID });
    useAIComposerDirectiveStore.getState().addDirectives("home", [
      { type: "agent", id: DATA_ANALYST_AGENT_ID, label: "Data Analyst" },
      {
        type: "skill",
        id: CONTENT_SKILL_INSTALLATION_ID,
        label: "Content modeling",
      },
    ]);
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我检查页面内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries[0]).toMatchObject({
        prompt: "帮我检查页面内容",
        mentionedAgentIds: [DATA_ANALYST_AGENT_ID],
        selectedSkillInstallationIds: [CONTENT_SKILL_INSTALLATION_ID],
      });
    });
  });

  it("ignores blank home composer submissions without entering the queue", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "build", selectedAgentId: COORDINATOR_AGENT_ID });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "   \n\t  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(useAiChatStore.getState().drawerOpen).toBe(false);
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);
  });

  it("hydrates a routed Skill Creator through the registered Skill directive", async () => {
    const prompt = ":skill[技能创建器]{name=installation-skill-creator} ";
    useAIComposerDirectiveStore.getState().addDirectives("home", [
      {
        type: "skill",
        id: "installation-skill-creator",
        label: "技能创建器",
        command: "skill-creator",
      },
    ]);
    searchMock.mockReturnValue({ prompt });

    renderHomePage();

    await waitFor(() => expect(assistantUiMockState.composerText).toBe(prompt));
  });

  it("moves the AI entry upward while preserving recent projects and inspiration", async () => {
    authState.accessToken = "token-1";
    authState.sessionVersion = 1;
    workspaceState.currentWorkspaceId = "workspace-1";
    vi.mocked(listProjects).mockResolvedValue({
      items: [createProjectListItem()],
      total: 1,
      page: 1,
      size: 4,
      pages: 1,
      next: null,
      prev: null,
    });

    const { container } = renderHomePage();

    expect(await screen.findByText("最近项目")).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledWith(expect.objectContaining({ size: 4 }));
    const routeFrame = container.querySelector('[data-slot="admin-route-frame"]');
    const home = container.querySelector('[data-page="ai-home"]');
    const hero = home?.querySelector('[data-slot="home-ai-entry"]');
    const projectPreview = container.querySelector('[data-slot="home-project-preview"]');

    expect(routeFrame).toHaveClass("pb-20");
    expect(home).toHaveClass("min-h-full");
    expect(hero).toHaveClass("min-h-[clamp(28rem,52svh,36rem)]");
    expect(screen.getByTestId("home-inspiration-section")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="home-create-project-preview"]'),
    ).not.toBeInTheDocument();
    expect(projectPreview).toHaveClass("bg-card");
    expect(projectPreview?.querySelector(".h-1\\.5")).not.toBeInTheDocument();
  });

  it("renders inspiration discovery below recent projects", async () => {
    const user = userEvent.setup();
    authState.accessToken = "token-1";
    authState.sessionVersion = 1;
    workspaceState.currentWorkspaceId = "workspace-1";
    vi.mocked(listProjects).mockResolvedValue({
      items: [createProjectListItem()],
      total: 1,
      page: 1,
      size: 4,
      pages: 1,
      next: null,
      prev: null,
    });

    renderHomePage();

    expect(await screen.findByTestId("home-inspiration-section")).toBeInTheDocument();
    const allTab = screen.getByRole("tab", { name: "全部" });
    const landingTab = screen.getByRole("tab", { name: "落地页" });
    const inspirationTabList = screen.getByRole("tablist", { name: "灵感发现" });
    expect(allTab).toHaveAttribute("data-state", "active");
    expect(landingTab).toBeInTheDocument();
    let inspirationTabPanel = screen.getByRole("tabpanel");
    expect(allTab).toHaveAttribute("aria-controls", inspirationTabPanel.id);
    expect(inspirationTabList).toHaveClass("max-w-full", "overflow-x-auto", "overflow-y-hidden");
    expect(allTab).toHaveClass("shrink-0");
    const inspirationTabs = screen.getByTestId("home-inspiration-tabs");
    expect(inspirationTabs).toHaveClass("mb-4", "min-w-0");
    expect(inspirationTabs).not.toHaveClass("sticky", "top-0");
    expect(inspirationTabs).not.toHaveAttribute("data-stuck");
    expect(screen.getByTestId("admin-masonry-grid")).toHaveAttribute("data-column-count", "4");
    const inspirationCard = document.querySelector('[data-slot="home-inspiration-card"]');
    const inspirationCardInfo = document.querySelector('[data-slot="home-inspiration-card-info"]');
    expect(inspirationCard).toHaveClass("overflow-hidden", "bg-card", "hover:border-border");
    expect(inspirationCard).not.toHaveClass("hover:-translate-y-1");
    expect(inspirationCard?.querySelector("img")).toHaveClass("absolute", "size-full");
    expect(inspirationCard?.querySelector("img")).not.toHaveClass("group-hover/card:scale-[1.035]");
    expect(inspirationCardInfo).toHaveClass("absolute", "bottom-0");
    expect(inspirationCardInfo?.className).toContain("bg-[linear-gradient");
    expect(screen.getByText("Editorial Studio")).toBeInTheDocument();
    expect(screen.getByText("SaaS Launch Desk")).toBeInTheDocument();
    allTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(landingTab).toHaveFocus();
    expect(landingTab).toHaveAttribute("data-state", "active");
    inspirationTabPanel = screen.getByRole("tabpanel");
    expect(landingTab).toHaveAttribute("aria-controls", inspirationTabPanel.id);
  });

  it("uses two inspiration columns on mobile", async () => {
    viewportMockState.isMobile = true;
    authState.accessToken = "token-1";
    authState.sessionVersion = 1;
    workspaceState.currentWorkspaceId = "workspace-1";
    vi.mocked(listProjects).mockResolvedValue({
      items: [createProjectListItem()],
      total: 1,
      page: 1,
      size: 4,
      pages: 1,
      next: null,
      prev: null,
    });

    renderHomePage();

    expect(await screen.findByTestId("admin-masonry-grid")).toHaveAttribute(
      "data-column-count",
      "2",
    );
  });
});

function createProjectListItem(): ProjectListItem {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    slug: "project-1",
    name: "Project One",
    description: "Project description",
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
    authoringMode: null,
    authoringState: "migration_required",
    authoringRevision: 1,
    isActive: true,
    archivedAt: null,
    archivedByUserId: null,
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-06-01T12:00:00Z",
    memberCount: 1,
    membersPreview: [],
    enterable: true,
    primaryRuntime: null,
  };
}
