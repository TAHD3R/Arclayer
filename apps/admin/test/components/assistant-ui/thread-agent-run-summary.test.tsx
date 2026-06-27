import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assistantUiMockState = vi.hoisted(() => ({
  customMetadata: {} as Record<string, unknown>,
  queueItems: [] as Array<{ id: string; prompt: string }>,
  removeQueueItem: vi.fn(),
  steerQueueItem: vi.fn(),
}));

const apiMock = vi.hoisted(() => ({
  formatAIChatError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
  resumeAIAgentRunForConversation: vi.fn(),
}));

vi.mock("@/api/ai", () => ({
  formatAIChatError: apiMock.formatAIChatError,
  resumeAIAgentRunForConversation: apiMock.resumeAIAgentRunForConversation,
}));

vi.mock("@assistant-ui/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const QueueItemContext = React.createContext<{ id: string; prompt: string } | null>(null);
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const passthroughPrimitive = new Proxy(
    {},
    {
      get: () => Passthrough,
    },
  );

  return {
    ActionBarMorePrimitive: passthroughPrimitive,
    ActionBarPrimitive: passthroughPrimitive,
    AuiIf: ({ children }: { children?: ReactNode }) => <>{children}</>,
    BranchPickerPrimitive: passthroughPrimitive,
    ComposerPrimitive: {
      ...passthroughPrimitive,
      Queue: ({
        children,
      }: {
        children: (value: { queueItem: { id: string; prompt: string } }) => ReactNode;
      }) => (
        <>
          {assistantUiMockState.queueItems.map((queueItem) => (
            <QueueItemContext.Provider key={queueItem.id} value={queueItem}>
              {children({ queueItem })}
            </QueueItemContext.Provider>
          ))}
        </>
      ),
    },
    ErrorPrimitive: passthroughPrimitive,
    MessagePrimitive: {
      Root: Passthrough,
      GroupedParts: () => null,
      Error: () => null,
    },
    QueueItemPrimitive: {
      Text: ({ className }: { className?: string }) => {
        const queueItem = React.useContext(QueueItemContext);
        return <span className={className}>{queueItem?.prompt}</span>;
      },
      Remove: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) => {
        const queueItem = React.useContext(QueueItemContext);
        const onClick = () => assistantUiMockState.removeQueueItem(queueItem?.id);
        if (asChild && React.isValidElement<{ onClick?: () => void }>(children)) {
          return React.cloneElement(children, { onClick });
        }
        return <button onClick={onClick}>{children}</button>;
      },
      Steer: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) => {
        const queueItem = React.useContext(QueueItemContext);
        const onClick = () => assistantUiMockState.steerQueueItem(queueItem?.id);
        if (asChild && React.isValidElement<{ onClick?: () => void }>(children)) {
          return React.cloneElement(children, { onClick });
        }
        return <button onClick={onClick}>{children}</button>;
      },
    },
    SuggestionPrimitive: passthroughPrimitive,
    ThreadPrimitive: {
      Root: Passthrough,
      Viewport: Passthrough,
      Messages: ({ children }: { children: (value: Record<string, never>) => ReactNode }) => (
        <>{children({})}</>
      ),
      ViewportFooter: () => null,
      ScrollToBottom: () => null,
      Suggestions: () => null,
    },
    groupPartByType: vi.fn(),
    useAuiState: (selector: (state: unknown) => unknown) =>
      selector({
        composer: {
          isEmpty: true,
          queue: assistantUiMockState.queueItems,
        },
        thread: {
          isLoading: false,
          messages: [{}],
        },
        threads: {
          isLoading: false,
        },
        message: {
          role: "assistant",
          composer: { isEditing: false },
          metadata: { custom: assistantUiMockState.customMetadata },
        },
      }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_RUN_SUMMARY_TITLE": "Agent run status",
        "ai:AI_AGENT_RUN_STATUS_FAILED": "Agent failed",
        "ai:AI_AGENT_RUN_STATUS_COMPLETED": "Agent completed",
        "ai:AI_AGENT_RUN_CHECKPOINT": "Checkpoint",
        "ai:AI_AGENT_RUN_THREAD": "Thread",
        "ai:AI_AGENT_RUN_TOOLS": `${String(values?.count ?? 0)} tools: ${String(values?.names ?? "")}`,
        "ai:AI_AGENT_RUN_TOKENS": `${String(values?.total ?? 0)} tokens (${String(
          values?.prompt ?? 0,
        )} prompt, ${String(values?.completion ?? 0)} completion)`,
        "ai:AI_AGENT_INTERRUPT_AGENT": "Agent",
        "ai:AI_AGENT_INTERRUPT_APPROVE": "Approve",
        "ai:AI_AGENT_INTERRUPT_APPROVED_COMMENT": "Approved",
        "ai:AI_AGENT_INTERRUPT_APPROVING": "Approving",
        "ai:AI_AGENT_INTERRUPT_CHECKPOINT": "Checkpoint",
        "ai:AI_AGENT_INTERRUPT_MODE": "Mode",
        "ai:AI_AGENT_INTERRUPT_REJECT": "Reject",
        "ai:AI_AGENT_INTERRUPT_REJECTED_COMMENT": "Rejected",
        "ai:AI_AGENT_INTERRUPT_REJECTING": "Rejecting",
        "ai:AI_AGENT_INTERRUPT_TITLE": "Approval checkpoint",
        "ai:AI_CHAT_QUEUE_LABEL": "Queued",
        "ai:AI_CHAT_QUEUE_REMOVE": "Remove queued message",
        "ai:AI_CHAT_QUEUE_RUN_NEXT": "Run this message next",
      };
      return labels[key] ?? key;
    },
  }),
}));

import { AgentRunSummary, ComposerQueue, Thread } from "@/components/assistant-ui/thread";

describe("AgentRunSummary", () => {
  beforeEach(() => {
    assistantUiMockState.customMetadata = {};
    assistantUiMockState.queueItems = [];
    assistantUiMockState.removeQueueItem.mockClear();
    assistantUiMockState.steerQueueItem.mockClear();
    apiMock.formatAIChatError.mockClear();
    apiMock.resumeAIAgentRunForConversation.mockReset();
  });

  it("renders failed agent run trace details from assistant metadata", () => {
    assistantUiMockState.customMetadata = {
      agentRunId: "run-failed-1",
      agentStatus: "failed",
      agentThreadId: "agent-run:run-failed-1",
      agentCheckpointId: "run-failed-1:run.failed",
    };

    render(<AgentRunSummary />);

    expect(screen.getByLabelText("Agent run status")).toHaveTextContent("Agent failed");
    expect(screen.getByLabelText("Agent run status")).toHaveTextContent("run-failed-1");
    expect(screen.getByLabelText("Agent run status")).toHaveTextContent("run-failed-1:run.failed");
  });

  it("renders tool and token telemetry from agent metadata", () => {
    assistantUiMockState.customMetadata = {
      agentRunId: "run-completed-1",
      agentStatus: "completed",
      agentExecutionSummary: {
        toolNames: ["get_content", "search_content"],
        promptTokens: 14,
        completionTokens: 20,
        totalTokens: 34,
      },
    };

    render(<AgentRunSummary />);

    const summary = screen.getByLabelText("Agent run status");
    expect(summary).toHaveTextContent("Agent completed");
    expect(summary).toHaveTextContent("2 tools: get_content, search_content");
    expect(summary).toHaveTextContent("34 tokens (14 prompt, 20 completion)");
  });

  it("does not duplicate the dedicated approval checkpoint card for interrupted runs", () => {
    assistantUiMockState.customMetadata = {
      agentRunId: "run-interrupt-1",
      agentStatus: "interrupted",
      agentThreadId: "agent-run:run-interrupt-1",
      agentCheckpointId: "run-interrupt-1:run.interrupted",
    };

    render(<AgentRunSummary />);

    expect(screen.queryByLabelText("Agent run status")).not.toBeInTheDocument();
  });
});

describe("AgentInterrupt", () => {
  beforeEach(() => {
    assistantUiMockState.customMetadata = {};
    assistantUiMockState.queueItems = [];
    assistantUiMockState.removeQueueItem.mockClear();
    assistantUiMockState.steerQueueItem.mockClear();
    apiMock.formatAIChatError.mockClear();
    apiMock.resumeAIAgentRunForConversation.mockReset();
  });

  it("shows a recoverable error when approval resume is rejected by permissions", async () => {
    const user = userEvent.setup();
    apiMock.resumeAIAgentRunForConversation.mockRejectedValueOnce(new Error("Permission denied"));
    assistantUiMockState.customMetadata = {
      conversationId: "conversation-resume-1",
      agentStatus: "interrupted",
      agentInterrupt: {
        kind: "agent_run_approval",
        runId: "run-resume-1",
        agentId: "content_builder",
        mode: "build",
        prompt: "Build draft changes",
        toolOutputs: {},
        requiredDecision: "approved",
        threadId: "agent-run:run-resume-1",
        checkpointId: "run-resume-1:run.interrupted",
      },
    };

    render(<Thread />);

    expect(screen.getByText("Approval checkpoint")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(apiMock.resumeAIAgentRunForConversation).toHaveBeenCalledWith("conversation-resume-1", {
      runId: "run-resume-1",
      approved: true,
      comment: "Approved",
    });
    expect(await screen.findByText("Permission denied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });
});

describe("ComposerQueue", () => {
  beforeEach(() => {
    assistantUiMockState.queueItems = [];
    assistantUiMockState.removeQueueItem.mockClear();
    assistantUiMockState.steerQueueItem.mockClear();
  });

  it("renders queued prompts with remove and run-next controls", async () => {
    const user = userEvent.setup();
    assistantUiMockState.queueItems = [
      { id: "queue-1", prompt: "Publish the staged draft" },
      { id: "queue-2", prompt: "Audit model fields" },
    ];

    render(<ComposerQueue />);

    expect(screen.getAllByText("Queued")).toHaveLength(2);
    expect(screen.getByText("Publish the staged draft")).toBeInTheDocument();
    expect(screen.getByText("Audit model fields")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run this message next" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Remove queued message" })).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "Run this message next" })[1]!);
    await user.click(screen.getAllByRole("button", { name: "Remove queued message" })[0]!);

    expect(assistantUiMockState.steerQueueItem).toHaveBeenCalledWith("queue-2");
    expect(assistantUiMockState.removeQueueItem).toHaveBeenCalledWith("queue-1");
  });

  it("does not render a queue container when there are no pending messages", () => {
    const { container } = render(<ComposerQueue />);

    expect(container.querySelector('[data-slot="aui_composer-queue"]')).not.toBeInTheDocument();
  });
});
