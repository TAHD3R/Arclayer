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
const CONTENT_SKILL_INSTALLATION_ID = "installation-content";
const SEO_SKILL_INSTALLATION_ID = "installation-seo";

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
vi.mock("@/components/ai/ai-approval-queue", () => ({
  AIApprovalQueue: ({ enabled }: { enabled: boolean }) =>
    enabled ? <div data-testid="ai-approval-queue">Agent approvals</div> : null,
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
    const { container } = render(<AIDrawerOverlay widthPx={360} assistantAvailable />);

    expect(screen.getByTestId("thread")).toBeInTheDocument();
    expect(screen.getByText("Homepage collaboration")).toBeInTheDocument();
    expect(screen.getByTestId("ai-approval-queue")).toBeInTheDocument();
    expect(container.querySelector("aside")).toHaveClass(
      "fixed",
      "inset-0",
      "h-svh",
      "w-full",
      "min-[769px]:static",
      "min-[769px]:w-[var(--ai-drawer-width)]",
    );
    expect(container.querySelector("aside")).toHaveStyle({ "--ai-drawer-width": "360px" });
    expect(screen.getByRole("button", { name: "ai:AI_CHAT_HIDE" })).toHaveClass(
      "size-11",
      "min-[769px]:size-8",
    );
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

  it("opens one Thread and forwards each entry's Skill selection through its runtime queue", async () => {
    useAIEntryStore
      .getState()
      .submit("先生成内容结构", [DATA_ANALYST_AGENT_ID], [CONTENT_SKILL_INSTALLATION_ID]);
    useAIEntryStore.getState().submit("继续生成字段说明", [], [SEO_SKILL_INSTALLATION_ID]);

    render(<AIDrawerOverlay widthPx={360} assistantAvailable />);

    await vi.waitFor(() => {
      expect(runtimeMocks.append).toHaveBeenCalledTimes(2);
    });
    expect(runtimeMocks.switchToNewThread).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.append).toHaveBeenNthCalledWith(1, {
      role: "user",
      content: [{ type: "text", text: "先生成内容结构" }],
      runConfig: {
        custom: {
          mentionedAgentIds: [DATA_ANALYST_AGENT_ID],
          selectedSkillInstallationIds: [CONTENT_SKILL_INSTALLATION_ID],
        },
      },
    });
    expect(runtimeMocks.append).toHaveBeenNthCalledWith(2, {
      role: "user",
      content: [{ type: "text", text: "继续生成字段说明" }],
      runConfig: {
        custom: {
          mentionedAgentIds: [],
          selectedSkillInstallationIds: [SEO_SKILL_INSTALLATION_ID],
        },
      },
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

    expect(drawer).toHaveClass("pointer-events-none", "mr-0", "w-0", "opacity-0");
    expect(drawer).not.toHaveClass("mr-4");
    expect(drawer).not.toHaveStyle({ width: "360px" });
  });
});
