import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppendMessage, ExternalThreadQueueAdapter } from "@assistant-ui/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjects } from "@/api/projects";
import { HomePage } from "@/pages/home/page";
import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";
import { DEFAULT_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAIEntryStore } from "@/stores/use-ai-entry-store";
import type { ProjectListItem } from "@arclayer/openapi/admin-types";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

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

const COORDINATOR_AGENT_ID = "tLTD4kqITA2PGQobLD1OAQ";
const DATA_ANALYST_AGENT_ID = "tLTD4kqITA2PGQobLD1OBg";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchMock(),
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
  AIComposerDirectiveChips: () => null,
}));

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

vi.mock("@/components/common/admin-masonry-grid", async () => {
  return {
    AdminMasonryGrid: ({
      items,
      render: Render,
    }: {
      items: Array<{ key: string }>;
      render: ComponentType<{ data: { key: string }; index: number; width: number }>;
    }) => (
      <div data-testid="admin-masonry-grid">
        {items.map((item, index) => (
          <Render key={item.key} data={item} index={index} width={260} />
        ))}
      </div>
    ),
    getAdminMasonryDatasetKey: (baseKey: string, orderedIds: readonly string[]) =>
      `${baseKey}:${orderedIds.join("|")}`,
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
  "ai:AI_CHAT_SEND": "发送",
  "ai:AI_CHAT_VOICE_INPUT": "语音输入",
  "ai:AI_CHAT_STOP_VOICE_INPUT": "停止语音输入",
  "ai:AI_CHAT_VOICE_UNSUPPORTED": "当前浏览器不支持语音输入。",
  "ai:AI_CHAT_HOME_RECENT_PROJECTS": "最近项目",
  "ai:AI_CHAT_HOME_SEE_ALL_PROJECTS": "查看全部",
  "ai:AI_CHAT_HOME_CREATE_PROJECT": "新建项目",
  "ai:AI_CHAT_HOME_PROJECT_UPDATED_AT": "更新于 2026-06-01 12:00",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "ai:AI_CHAT_HOME_GREETING") {
        return `How can I help you today, ${String(options?.name ?? "朋友")}?`;
      }
      return labels[key] ?? key;
    },
  }),
}));

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      size: 3,
      pages: 1,
      next: null,
      prev: null,
    });
    assistantUiMockState.composerText = "";
    assistantUiMockState.runtimeStore = null;
    useAIEntryStore.setState({ entries: [] });
    useAIComposerDirectiveStore.setState({
      directivesByScope: { thread: [], home: [] },
    });
    useAiChatStore.setState({
      selectedModel: DEFAULT_AI_CHAT_MODEL,
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
      <QueryClientProvider client={queryClient}>
        <ChromeTabsProvider
          labels={{
            scrollLeftAriaLabel: "向左滚动",
            scrollRightAriaLabel: "向右滚动",
          }}
        >
          <HomePage />
        </ChromeTabsProvider>
      </QueryClientProvider>,
    );
  }

  it("renders the Home entry surface without a legacy conversation state", () => {
    renderHomePage();

    expect(screen.getByText("How can I help you today, 朋友?")).toBeInTheDocument();
    expect(screen.getByTestId("home-ai-suggestions")).toBeInTheDocument();
    expect(useAiChatStore.getState()).not.toHaveProperty("conversations");
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

  it("keeps Home @Agent mentions as structured IDs for the normalized Run", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "plan", selectedAgentId: COORDINATOR_AGENT_ID });
    useAIComposerDirectiveStore
      .getState()
      .addDirectives("home", [{ type: "agent", id: DATA_ANALYST_AGENT_ID, label: "Data Analyst" }]);
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我检查页面内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(useAIEntryStore.getState().entries[0]).toMatchObject({
        prompt: "帮我检查页面内容",
        mentionedAgentIds: [DATA_ANALYST_AGENT_ID],
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

  it("lets the default route frame provide bottom air when recent projects render", async () => {
    authState.accessToken = "token-1";
    authState.sessionVersion = 1;
    workspaceState.currentWorkspaceId = "workspace-1";
    vi.mocked(listProjects).mockResolvedValue({
      items: [createProjectListItem()],
      total: 1,
      page: 1,
      size: 3,
      pages: 1,
      next: null,
      prev: null,
    });

    const { container } = renderHomePage();

    expect(await screen.findByText("最近项目")).toBeInTheDocument();
    const routeFrame = container.querySelector('[data-slot="admin-route-frame"]');
    const home = container.querySelector('[data-page="ai-home"]');
    const hero = home?.firstElementChild;

    expect(routeFrame).toHaveClass("pb-20");
    expect(home).not.toHaveClass("min-h-full");
    expect(hero).toHaveClass("min-h-[clamp(20rem,42vh,28rem)]");
  });

  it("renders inspiration discovery below recent projects", async () => {
    authState.accessToken = "token-1";
    authState.sessionVersion = 1;
    workspaceState.currentWorkspaceId = "workspace-1";
    vi.mocked(listProjects).mockResolvedValue({
      items: [createProjectListItem()],
      total: 1,
      page: 1,
      size: 3,
      pages: 1,
      next: null,
      prev: null,
    });

    renderHomePage();

    expect(await screen.findByTestId("home-inspiration-section")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "落地页" })).toBeInTheDocument();
    expect(screen.getByText("Editorial Studio")).toBeInTheDocument();
    expect(screen.getByText("SaaS Launch Desk")).toBeInTheDocument();
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
