import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppendMessage, ExternalThreadQueueAdapter } from "@assistant-ui/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjects } from "@/api/projects";
import { HomePage } from "@/pages/home/page";
import { DEFAULT_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";
import type { ProjectListItem } from "@arclayer/openapi/admin-types";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

const {
  cancelAIAgentRunMock,
  ensureAIConversationPersistedForRuntimeMock,
  navigateMock,
  searchMock,
  sendAIAgentMessageMock,
  sendAIChatMessageMock,
  sendAIWorkspaceActionPlanMessageMock,
  sendAIWorkspaceActionMessageMock,
} = vi.hoisted(() => ({
  cancelAIAgentRunMock: vi.fn(),
  ensureAIConversationPersistedForRuntimeMock: vi.fn(),
  navigateMock: vi.fn(),
  searchMock: vi.fn(),
  sendAIAgentMessageMock: vi.fn(),
  sendAIChatMessageMock: vi.fn(),
  sendAIWorkspaceActionPlanMessageMock: vi.fn(),
  sendAIWorkspaceActionMessageMock: vi.fn(),
}));

const assistantUiMockState = vi.hoisted(() => ({
  composerText: "",
  runtimeStore: null as null | {
    onCancel?: () => Promise<void>;
    onNew?: (message: AppendMessage) => Promise<void>;
    queue?: ExternalThreadQueueAdapter;
  },
}));

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

vi.mock("@/components/ai/ai-chat-runtime", () => ({
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
  agentIdForComposerMode: (mode: string, selectedAgentId: string) => {
    if (mode === "build") return "content_builder";
    if (mode === "plan") return "content_advisor";
    return selectedAgentId || "content_analyzer";
  },
  agentIdFromComposerDirective: () => null,
  createAIChatAttachmentAdapter: () => undefined,
  projectIdFromComposerDirective: (text: string) =>
    /:project\[[^\]\n]{1,1024}\]\{name=([^}\n]{1,1024})\}/u.exec(text)?.[1]?.trim() ?? null,
  sendAIChatMessage: (...args: unknown[]) => sendAIChatMessageMock(...args),
  sendAIWorkspaceActionPlanMessage: (...args: unknown[]) =>
    sendAIWorkspaceActionPlanMessageMock(...args),
  sendAIWorkspaceActionMessage: (...args: unknown[]) => sendAIWorkspaceActionMessageMock(...args),
  shouldPlanAIWorkspaceAction: (mode: string, message: string) =>
    mode === "plan" && /创建.*项目|项目.*创建/.test(message),
}));

vi.mock("@/api/ai", () => ({
  AI_AGENT_PROJECT_CONTEXT_REQUIRED: "AI_AGENT_PROJECT_CONTEXT_REQUIRED",
  cancelAIAgentRun: (...args: unknown[]) => cancelAIAgentRunMock(...args),
  ensureAIConversationPersistedForRuntime: (...args: unknown[]) =>
    ensureAIConversationPersistedForRuntimeMock(...args),
  formatAIChatError: (error: unknown) =>
    error instanceof Error && error.message === "AI_AGENT_PROJECT_CONTEXT_REQUIRED"
      ? "Agent 模式需要先进入一个项目。规划和构建模式可在工作区首页直接使用。"
      : error instanceof Error
        ? error.message
        : "Request failed",
  listAIProjectAgents: vi.fn(async () => ({
    agents: [
      {
        agentId: "content_builder",
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
  shouldUseAIWorkspaceAction: (message: string) => /创建.*项目|项目.*创建/.test(message),
  sendAIAgentMessage: (...args: unknown[]) => sendAIAgentMessageMock(...args),
}));

vi.mock("@/api/projects", () => ({
  listProjects: vi.fn(),
}));

function appendTextMessage(text: string): AppendMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
    attachments: [],
    createdAt: new Date(),
    parentId: null,
    sourceId: null,
    runConfig: undefined,
    metadata: { custom: {} },
  };
}

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
    cancelAIAgentRunMock.mockResolvedValue(undefined);
    ensureAIConversationPersistedForRuntimeMock.mockResolvedValue(undefined);
    sendAIAgentMessageMock.mockResolvedValue(undefined);
    sendAIChatMessageMock.mockResolvedValue(undefined);
    sendAIWorkspaceActionMessageMock.mockResolvedValue(undefined);
    useAiChatStore.setState({
      conversations: [],
      activeId: null,
      streaming: false,
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedReasoningEffort: "medium",
      composerMode: "build",
      selectedAgentId: "content_analyzer",
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

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    return { promise, resolve, reject };
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
    expect(screen.getByTestId("home-ai-suggestions")).toBeInTheDocument();
    expect(screen.queryByText("Side panel only content")).not.toBeInTheDocument();
  });

  it("creates a conversation, opens the drawer, and sends the first prompt through chat mode", () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
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
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(sendAIAgentMessageMock).not.toHaveBeenCalled();
  });

  it("routes home project creation prompts through workspace actions", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "build" });
    sendAIWorkspaceActionMessageMock.mockResolvedValueOnce({
      action: "create_project",
      status: "completed",
      content: "已在当前工作区创建项目“随机项目”。",
      project: {
        id: "project-1",
        workspaceId: "workspace-1",
        name: "随机项目",
        slug: "random-project",
        description: "用于测试",
      },
      projects: [],
      navigation: {
        label: "进入项目",
        path: "/projects/project-1",
      },
    });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我创建一个随机项目" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const conversationId = useAiChatStore.getState().conversations[0]?.id;
    await waitFor(() => {
      expect(sendAIWorkspaceActionMessageMock).toHaveBeenCalledWith(
        conversationId,
        "帮我创建一个随机项目",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(sendAIChatMessageMock).not.toHaveBeenCalled();
    expect(sendAIAgentMessageMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(workspaceState.setCurrentWorkspaceId).toHaveBeenCalledWith("workspace-1");
      expect(workspaceState.setCurrentProjectId).toHaveBeenCalledWith("project-1");
      expect(navigateMock).toHaveBeenCalledWith({ to: "/projects/project-1" });
    });
  });

  it("keeps home Plan mode project creation prompts in a workspace action plan", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "plan" });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我创建一个随机项目" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const conversationId = useAiChatStore.getState().conversations[0]?.id;
    await waitFor(() => {
      expect(sendAIWorkspaceActionPlanMessageMock).toHaveBeenCalledWith(
        conversationId,
        "帮我创建一个随机项目",
      );
    });
    expect(sendAIChatMessageMock).not.toHaveBeenCalled();
    expect(sendAIWorkspaceActionMessageMock).not.toHaveBeenCalled();
    expect(sendAIAgentMessageMock).not.toHaveBeenCalled();
  });

  it("queues repeated home prompts during the first agent run and reuses the same conversation", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    const pendingRuns: Array<() => void> = [];
    sendAIAgentMessageMock.mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          pendingRuns.push(resolve);
        }),
    );
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "先生成内容结构" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(sendAIAgentMessageMock).toHaveBeenCalledTimes(1));
    const conversationId = useAiChatStore.getState().conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("继续生成字段说明"), {
        steer: false,
      });
    });

    expect(sendAIAgentMessageMock).toHaveBeenCalledTimes(1);
    expect(assistantUiMockState.runtimeStore?.queue?.items.map((item) => item.prompt)).toEqual([
      "继续生成字段说明",
    ]);

    await act(async () => {
      pendingRuns[0]?.();
    });

    await waitFor(() => expect(sendAIAgentMessageMock).toHaveBeenCalledTimes(2));
    expect(useAiChatStore.getState().conversations).toHaveLength(1);
    expect(sendAIAgentMessageMock).toHaveBeenLastCalledWith(
      conversationId,
      "继续生成字段说明",
      expect.objectContaining({
        agentId: "content_builder",
        model: DEFAULT_AI_CHAT_MODEL,
        reasoningEffort: "medium",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);

    await act(async () => {
      pendingRuns[1]?.();
    });
  });

  it("shows an explicit error instead of silently falling back without an active project", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "agent" });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我构建内容计划" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => {
      expect(screen.getByText(/Agent 模式需要先进入一个项目/)).toBeInTheDocument();
    });
    const state = useAiChatStore.getState();
    expect(state.drawerOpen).toBe(false);
    expect(state.conversations).toHaveLength(0);
    expect(sendAIAgentMessageMock).not.toHaveBeenCalled();
  });

  it("uses a project directive as the Agent mode project context on the home surface", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: ":project[Project One]{name=project-1} 帮我构建内容计划" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const conversationId = useAiChatStore.getState().conversations[0]?.id;
    await waitFor(() => {
      expect(sendAIAgentMessageMock).toHaveBeenCalledWith(
        conversationId,
        "帮我构建内容计划",
        expect.objectContaining({
          agentId: "content_builder",
          projectId: "project-1",
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(screen.queryByText(/Agent 模式需要先进入一个项目/)).not.toBeInTheDocument();
  });

  it("ignores blank home composer submissions without entering the queue", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "   \n\t  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(sendAIAgentMessageMock).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().drawerOpen).toBe(false);
    expect(useAiChatStore.getState().conversations).toEqual([]);
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);
  });

  it("cancels the active home agent run with the backend", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    const pendingRun = createDeferred<void>();
    sendAIAgentMessageMock.mockImplementation(async (conversationId, text, options) => {
      useAiChatStore.getState().appendMessage(conversationId, { role: "user", content: text });
      useAiChatStore.getState().appendDelta(conversationId, "");
      options.onRunCreated("run-home-1");
      return pendingRun.promise;
    });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我构建内容计划" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(sendAIAgentMessageMock).toHaveBeenCalled());
    await act(async () => {
      await assistantUiMockState.runtimeStore?.onCancel?.();
    });

    expect(cancelAIAgentRunMock).toHaveBeenCalledWith("project-1", "run-home-1");
    expect(useAiChatStore.getState().conversations[0]?.messages.at(-1)).toMatchObject({
      role: "assistant",
      agentRunId: "run-home-1",
      agentStatus: "cancelled",
    });
    expect(ensureAIConversationPersistedForRuntimeMock).toHaveBeenCalledWith(expect.any(String));
    await act(async () => {
      pendingRun.resolve();
    });
  });

  it("clears queued home prompts when the active home agent run is cancelled", async () => {
    workspaceState.currentWorkspaceId = "workspace-1";
    workspaceState.lastWorkspaceId = "workspace-1";
    workspaceState.currentProjectId = "project-1";
    workspaceState.lastProjectId = "project-1";
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    const pendingRun = createDeferred<void>();
    sendAIAgentMessageMock.mockImplementation(async (conversationId, text, options) => {
      useAiChatStore.getState().appendMessage(conversationId, { role: "user", content: text });
      useAiChatStore.getState().appendDelta(conversationId, "");
      options.onRunCreated("run-home-queued-1");
      return pendingRun.promise;
    });
    renderHomePage();

    fireEvent.change(screen.getByRole("textbox", { name: "询问 AI…" }), {
      target: { value: "帮我构建内容计划" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(sendAIAgentMessageMock).toHaveBeenCalledTimes(1));
    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("取消后不应发送"), {
        steer: false,
      });
    });
    expect(assistantUiMockState.runtimeStore?.queue?.items.map((item) => item.prompt)).toEqual([
      "取消后不应发送",
    ]);

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onCancel?.();
    });

    expect(cancelAIAgentRunMock).toHaveBeenCalledWith("project-1", "run-home-queued-1");
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);
    await act(async () => {
      pendingRun.resolve();
    });
    await waitFor(() => expect(sendAIAgentMessageMock).toHaveBeenCalledTimes(1));
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
