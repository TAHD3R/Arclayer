import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjects } from "@/api/projects";
import { HomePage } from "@/pages/home/page";
import { DEFAULT_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";
import type { ProjectListItem } from "@arclayer/openapi/admin-types";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

const { navigateMock, sendAIChatMessageMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  sendAIChatMessageMock: vi.fn(),
}));

const assistantUiMockState = vi.hoisted(() => ({
  composerText: "",
  runtimeStore: null as null | {
    onNew?: (message: { role: "user"; content: string }) => Promise<void>;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@assistant-ui/react", async () => {
  const React = await import("react");

  return {
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
                assistantUiMockState.runtimeStore?.onNew?.({
                  role: "user",
                  content: assistantUiMockState.composerText,
                }),
            } as React.HTMLAttributes<HTMLElement>)
          : children,
      StopDictation: ({ children }: { children?: ReactNode }) => <>{children}</>,
    },
    SimpleTextAttachmentAdapter: class SimpleTextAttachmentAdapter {},
    WebSpeechDictationAdapter: {
      isSupported: () => false,
    },
    useAssistantRuntime: () => null,
    useExternalStoreRuntime: (store: unknown) => {
      assistantUiMockState.runtimeStore = store as typeof assistantUiMockState.runtimeStore;
      return store;
    },
  };
});

vi.mock("@/components/ai/ai-chat-runtime", () => ({
  appendMessageToText: (message: { content: string }) => message.content,
  sendAIChatMessage: (...args: unknown[]) => sendAIChatMessageMock(...args),
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
};

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (
    selector: (state: {
      currentWorkspaceId: string | null;
      lastWorkspaceId: string | null;
    }) => unknown,
  ) => selector(workspaceState),
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
    authState.accessToken = null;
    authState.sessionVersion = 0;
    workspaceState.currentWorkspaceId = null;
    workspaceState.lastWorkspaceId = null;
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
    sendAIChatMessageMock.mockResolvedValue(undefined);
    useAiChatStore.setState({
      conversations: [],
      activeId: null,
      streaming: false,
      selectedModel: DEFAULT_AI_CHAT_MODEL,
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

  it("does not render the active side-panel conversation on the home entry surface", () => {
    useAiChatStore.setState({
      conversations: [
        {
          id: "conv-1",
          title: "Existing",
          messages: [{ role: "assistant", content: "Side panel only content" }],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeId: "conv-1",
    });

    renderHomePage();

    expect(screen.getByText("How can I help you today, 朋友?")).toBeInTheDocument();
    expect(screen.queryByText("Side panel only content")).not.toBeInTheDocument();
  });

  it("creates a conversation, opens the drawer, and sends the first prompt", () => {
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我总结今天的任务" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const state = useAiChatStore.getState();
    expect(state.drawerOpen).toBe(true);
    expect(state.conversations).toHaveLength(1);
    expect(state.activeId).toBe(state.conversations[0].id);
    expect(sendAIChatMessageMock).toHaveBeenCalledWith(
      state.conversations[0].id,
      "帮我总结今天的任务",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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
