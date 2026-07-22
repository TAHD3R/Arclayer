import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIDrawerOverlay } from "@/components/ai/ai-drawer-overlay";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useAIEntryStore } from "@/stores/use-ai-entry-store";

const runtimeMocks = vi.hoisted(() => ({
  append: vi.fn(async () => undefined),
  switchToNewThread: vi.fn(async () => undefined),
}));

const COORDINATOR_AGENT_ID = "tLTD4kqITA2PGQobLD1OAQ";
const DATA_ANALYST_AGENT_ID = "tLTD4kqITA2PGQobLD1OBg";

vi.mock("@assistant-ui/react", () => ({
  useAui: () => ({
    threads: () => ({ switchToNewThread: runtimeMocks.switchToNewThread }),
    thread: () => ({ append: runtimeMocks.append }),
  }),
  useAuiState: (selector: (state: unknown) => unknown) =>
    selector({
      threadListItem: { title: "Homepage collaboration", remoteId: "thread-1" },
      threads: { threadIds: [], archivedThreadIds: [] },
    }),
}));
vi.mock("@/components/ai/agent-thread-history", () => ({
  AgentThreadHistory: () => <button type="button">Conversation history</button>,
}));
vi.mock("@/components/assistant-ui/thread", () => ({
  Thread: ({ composerAccessory }: { composerAccessory?: ReactNode }) => (
    <div data-testid="thread">{composerAccessory}</div>
  ),
}));
vi.mock("@/components/feedback/feedback-dialog", () => ({
  FeedbackComposer: ({
    source,
    hiddenContext,
  }: {
    source: string;
    hiddenContext?: { threadId?: string };
  }) => (
    <div
      data-testid="feedback-composer"
      data-source={source}
      data-thread-id={hiddenContext?.threadId}
    />
  ),
}));
vi.mock("@/hooks/use-current-user-profile", () => ({
  useCurrentUserProfile: () => ({ profile: { displayName: "Philip Cole" } }),
}));
vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: "token-1" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => children,
  TooltipContent: ({ children }: { children?: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => children,
}));

describe("AIDrawerOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAIEntryStore.setState({ entries: [] });
    useAiChatStore.setState({
      drawerOpen: true,
      composerMode: "build",
      selectedAgentId: COORDINATOR_AGENT_ID,
    });
  });

  it("binds the Drawer directly to the normalized workspace Thread runtime", () => {
    render(<AIDrawerOverlay widthPx={360} assistantAvailable />);

    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(screen.getByText("Homepage collaboration")).toBeInTheDocument();
  });

  it("creates a new remote Thread through the shared scene runtime", () => {
    render(<AIDrawerOverlay widthPx={360} assistantAvailable />);

    fireEvent.click(screen.getByRole("button", { name: "ai:AI_CHAT_NEW_CONVERSATION" }));
    expect(runtimeMocks.switchToNewThread).toHaveBeenCalledTimes(1);
  });

  it("places the feedback action before history and toggles a composer card above the Thread composer", () => {
    render(<AIDrawerOverlay widthPx={360} assistantAvailable />);

    const feedbackButton = screen.getByRole("button", { name: "ai:AI_CHAT_FEEDBACK" });
    const historyButton = screen.getByRole("button", { name: "Conversation history" });
    expect(
      feedbackButton.compareDocumentPosition(historyButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const composer = screen.getByTestId("feedback-composer");
    expect(composer.parentElement).toHaveClass("hidden");
    fireEvent.click(feedbackButton);
    expect(composer.parentElement).not.toHaveClass("hidden");
    expect(composer).toHaveAttribute("data-source", "ai_sidebar");
    expect(composer).toHaveAttribute("data-thread-id", "thread-1");
  });

  it("opens one Thread and drains repeated entry prompts through its runtime queue", async () => {
    useAIEntryStore.getState().submit("先生成内容结构", [DATA_ANALYST_AGENT_ID]);
    useAIEntryStore.getState().submit("继续生成字段说明");

    render(<AIDrawerOverlay widthPx={360} assistantAvailable />);

    await vi.waitFor(() => {
      expect(runtimeMocks.append).toHaveBeenCalledTimes(2);
    });
    expect(runtimeMocks.switchToNewThread).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.append).toHaveBeenNthCalledWith(1, {
      role: "user",
      content: [{ type: "text", text: "先生成内容结构" }],
      runConfig: { custom: { mentionedAgentIds: [DATA_ANALYST_AGENT_ID] } },
    });
    expect(runtimeMocks.append).toHaveBeenNthCalledWith(2, {
      role: "user",
      content: [{ type: "text", text: "继续生成字段说明" }],
      runConfig: { custom: { mentionedAgentIds: [] } },
    });
    expect(useAIEntryStore.getState().entries).toEqual([]);
  });

  it("shows an explicit context requirement instead of mounting a fake conversation", () => {
    render(<AIDrawerOverlay widthPx={360} assistantAvailable={false} />);

    expect(screen.getByText("ai:AI_CHAT_PROJECT_SELECT")).toBeInTheDocument();
    expect(screen.queryByTestId("thread")).not.toBeInTheDocument();
  });

  it("releases its horizontal layout space when closed", () => {
    useAiChatStore.setState({ drawerOpen: false });

    const { container } = render(<AIDrawerOverlay widthPx={360} assistantAvailable />);
    const drawer = container.querySelector("aside");

    expect(drawer).toHaveClass("mr-0", "w-0", "opacity-0");
    expect(drawer).not.toHaveClass("mr-4");
    expect(drawer).not.toHaveStyle({ width: "360px" });
  });
});
