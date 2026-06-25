import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjects } from "@/api/projects";
import { HomePage } from "@/pages/home/page";
import { DEFAULT_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";
import type { ProjectListItem } from "@arclayer/openapi/admin-types";

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
    AssistantRuntimeProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    AuiIf: ({
      children,
      condition: _condition,
    }: {
      children?: React.ReactNode;
      condition?: (state: {
        thread: { isRunning: boolean; capabilities: { dictation: boolean } };
        composer: { dictation: null; isEmpty: boolean };
      }) => boolean;
    }) => <>{children}</>,
    CompositeAttachmentAdapter: class CompositeAttachmentAdapter {
      constructor(public adapters: unknown[]) {}
    },
    ComposerPrimitive: {
      AddAttachment: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      AttachmentDropzone: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      Attachments: () => null,
      Cancel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      Dictate: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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
      Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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
      StopDictation: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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
        <HomePage />
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
