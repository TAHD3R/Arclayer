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

const routerMock = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => routerMock.navigate,
  };
});

vi.mock("@/components/ai/ai-composer-triggers", () => ({
  AIComposerTriggers: () => null,
}));

vi.mock("@/components/ai/ai-suggestions", () => ({
  AISuggestions: () => null,
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
    useScrollLock: () => vi.fn(),
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
        "ai:AI_CHAT_TOOL_CALLS_TITLE": `${String(values?.count ?? 0)} tool calls`,
        "ai:AI_CHAT_TOOL_CALLS_ACTIVE": `${String(values?.count ?? 0)} tool calls running`,
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
        "ai:AI_WORKSPACE_ACTION_PROJECT_APP_ENTRY_BADGE": `Entry ${String(values?.path ?? "")}`,
        "ai:AI_WORKSPACE_ACTION_PROJECT_CONTENT_ITEM_COUNT": `${String(
          values?.count ?? 0,
        )} content items`,
        "ai:AI_WORKSPACE_ACTION_PROJECT_CONTENT_MODEL_COUNT": `${String(
          values?.count ?? 0,
        )} content models`,
        "ai:AI_WORKSPACE_ACTION_PROJECT_CREATED_TITLE": "Workspace project created",
        "ai:AI_WORKSPACE_ACTION_PROJECT_HOMEPAGE_BADGE": `Homepage: ${String(values?.title ?? "")}`,
        "ai:AI_WORKSPACE_ACTION_PROJECT_OPEN_CONTENT_LIBRARY": "Content library",
        "ai:AI_WORKSPACE_ACTION_PROJECT_OPEN_EDITOR": "Open editor",
        "ai:AI_WORKSPACE_ACTION_PROJECT_OPEN_PROJECT_SETTINGS": "Project settings",
        "ai:AI_WORKSPACE_ACTION_PROJECT_OPEN_DOMAINS": "Domains",
        "ai:AI_WORKSPACE_ACTION_PROJECT_OPEN_RELEASES": "Releases",
        "ai:AI_WORKSPACE_ACTION_PROJECT_OPEN_WEBSITE_CONTROL": "Website control",
        "ai:AI_WORKSPACE_ACTION_PROJECT_RELEASE_BADGE": `Release ${String(values?.number ?? "")}`,
        "ai:AI_WORKSPACE_ACTION_PROJECT_RELEASE_NOT_READY": "Release not ready",
        "ai:AI_WORKSPACE_ACTION_PROJECT_RELEASE_READY": "Release ready",
        "ai:AI_WORKSPACE_ACTION_PROJECT_ROUTE_BADGE": `Route ${String(values?.path ?? "")}`,
        "ai:AI_WORKSPACE_ACTION_PROJECT_SOURCE_FILE_COUNT": `${String(
          values?.count ?? 0,
        )} source files`,
        "ai:AI_WORKSPACE_ACTION_STATUS_COMPLETED": "Completed",
      };
      return labels[key] ?? key;
    },
  }),
}));

import { ComposerQueue, Thread } from "@/components/assistant-ui/thread";

describe("retired conversation metadata", () => {
  beforeEach(() => {
    assistantUiMockState.customMetadata = {};
    assistantUiMockState.queueItems = [];
    assistantUiMockState.removeQueueItem.mockClear();
    assistantUiMockState.steerQueueItem.mockClear();
  });

  it("does not expose the retired conversation approval protocol", () => {
    assistantUiMockState.customMetadata = {
      conversationId: "conversation-resume-1",
      agentRunId: "run-resume-1",
      agentStatus: "interrupted",
      agentArtifact: {
        type: "agent_execution_plan",
        goal: "Legacy plan",
        status: "planned",
        steps: [],
      },
      workspaceAction: {
        type: "workspace_project_created",
        status: "completed",
        project: { id: "project-legacy", name: "Legacy project", slug: "legacy" },
        navigation: { label: "Open", path: "/projects/project-legacy" },
      },
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

    expect(screen.queryByText("Approval checkpoint")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Agent run status")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace project created")).not.toBeInTheDocument();
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
