import type { ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureAIConversationPersistedForRuntime, loadAIConversations } from "@/api/ai";
import { AIDrawerOverlay } from "@/components/ai/ai-drawer-overlay";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

const routeState = vi.hoisted(() => ({
  pathname: "/system/settings/access",
  searchStr: "",
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (options: { select: (state: unknown) => unknown }) =>
    options.select({
      location: {
        pathname: routeState.pathname,
        searchStr: routeState.searchStr,
      },
    }),
}));

vi.mock("@/api/ai", () => ({
  ensureAIConversationPersistedForRuntime: vi.fn(async () => undefined),
  loadAIConversations: vi.fn(async () => undefined),
  renameAIConversation: vi.fn(async () => undefined),
}));

vi.mock("@/components/assistant-ui/thread", () => ({
  Thread: () => <div data-testid="thread" />,
}));

vi.mock("@/components/ai/ai-approval-queue", () => ({
  AIApprovalQueue: () => <div data-testid="approval-queue" />,
}));

vi.mock("@/components/ai/ai-chat-runtime", () => ({
  AIChatRuntimeProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ai/ai-context-recommendations", () => ({
  AIContextRecommendations: () => <div data-testid="context-recommendations" />,
}));

vi.mock("@/components/ai/ai-content-proposal-card", () => ({
  AIContentProposalCard: () => <div data-testid="content-proposal-card" />,
}));

vi.mock("@/components/feedback/feedback-dialog", () => ({
  FeedbackDialog: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/hooks/use-current-user-profile", () => ({
  useCurrentUserProfile: () => ({ profile: { displayName: "Philip Cole" } }),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: "token-1" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

function renderDrawer() {
  return render(<AIDrawerOverlay widthPx={360} />);
}

describe("AIDrawerOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.pathname = "/system/settings/access";
    routeState.searchStr = "";
    useAiChatStore.setState({
      conversations: [
        {
          id: "conversation-1",
          title: "Access policy review",
          messages: [],
          contextSnapshot: {
            pathname: "/system/settings/access",
            search: "",
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      activeId: "conversation-1",
      streaming: false,
      drawerOpen: true,
    });
  });

  it("does not persist an empty active conversation when the current page changes", async () => {
    const view = renderDrawer();

    await waitFor(() => expect(loadAIConversations).toHaveBeenCalled());
    expect(ensureAIConversationPersistedForRuntime).not.toHaveBeenCalled();

    routeState.pathname = "/system/settings/agents";
    window.history.pushState({}, "", "/system/settings/agents");
    view.rerender(<AIDrawerOverlay widthPx={360} />);

    expect(ensureAIConversationPersistedForRuntime).not.toHaveBeenCalled();
  });

  it("refreshes the page context for conversations that already have messages", async () => {
    useAiChatStore.setState((state) => ({
      conversations: state.conversations.map((conversation) => ({
        ...conversation,
        messages: [{ role: "user", content: "Review the old page" }],
      })),
    }));

    const view = renderDrawer();
    routeState.pathname = "/system/settings/agents";
    window.history.pushState({}, "", "/system/settings/agents");
    view.rerender(<AIDrawerOverlay widthPx={360} />);

    await waitFor(() => expect(loadAIConversations).toHaveBeenCalled());
    await waitFor(() => {
      expect(ensureAIConversationPersistedForRuntime).toHaveBeenCalledWith("conversation-1");
    });
  });

  it("opens with a local draft conversation without persisting it", async () => {
    useAiChatStore.setState({
      conversations: [],
      activeId: null,
      streaming: false,
      drawerOpen: true,
    });

    renderDrawer();

    await waitFor(() => expect(loadAIConversations).toHaveBeenCalled());
    await waitFor(() => {
      expect(useAiChatStore.getState().activeId).toBeTruthy();
    });
    expect(useAiChatStore.getState().conversations).toHaveLength(1);
    expect(useAiChatStore.getState().conversations[0]?.messages).toHaveLength(0);
    expect(ensureAIConversationPersistedForRuntime).not.toHaveBeenCalled();
  });
});
