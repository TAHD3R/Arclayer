import { act, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeCapture = vi.hoisted(() => ({
  external: null as Record<string, unknown> | null,
  remoteThreadId: "thread-1" as string | null,
}));
const apiMocks = vi.hoisted(() => ({
  cancelAgentRun: vi.fn(),
  createAgentRun: vi.fn(),
  getAgentRunSnapshot: vi.fn(),
  getAgentThread: vi.fn(),
  respondToAgentToolCall: vi.fn(),
  resumeAgentRun: vi.fn(),
  consumeAgentRunStream: vi.fn(),
  initializeThread: vi.fn(),
  reloadThreads: vi.fn(),
}));

vi.mock("@assistant-ui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@assistant-ui/react")>()),
  AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => children,
  Tools: () => ({ kind: "toolkit-resource" }),
  useAui: () => ({
    kind: "assistant-client",
    threadListItem: () => ({ initialize: apiMocks.initializeThread }),
    threads: () => ({ reload: apiMocks.reloadThreads }),
  }),
  useAuiState: (selector: (state: unknown) => unknown) =>
    selector({ threadListItem: { remoteId: runtimeCapture.remoteThreadId } }),
  useExternalStoreRuntime: (adapter: Record<string, unknown>) => {
    runtimeCapture.external = adapter;
    return { kind: "external-runtime" };
  },
  useRemoteThreadListRuntime: ({ runtimeHook }: { runtimeHook: () => unknown }) => runtimeHook(),
}));
vi.mock("@/lib/ai/agent-run-api", () => ({
  cancelAgentRun: apiMocks.cancelAgentRun,
  createAgentRun: apiMocks.createAgentRun,
  getAgentRunSnapshot: apiMocks.getAgentRunSnapshot,
  respondToAgentToolCall: apiMocks.respondToAgentToolCall,
  resumeAgentRun: apiMocks.resumeAgentRun,
}));
vi.mock("@/lib/ai/agent-thread-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/agent-thread-api")>()),
  getAgentThread: apiMocks.getAgentThread,
}));
vi.mock("@/lib/ai/agent-run-stream-controller", () => ({
  consumeAgentRunStream: apiMocks.consumeAgentRunStream,
}));

import { ArclayerAssistantProvider } from "@/components/ai/arclayer-assistant-provider";
import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";

const runSnapshot = {
  snapshotVersion: 1,
  runId: "run-1",
  threadId: "thread-1",
  run: { status: "queued", interrupt: null },
  messages: [],
  terminal: false,
  lastSequence: 2,
  lastCursor: "cursor-2",
};

const COORDINATOR_AGENT_ID = "tLTD4kqITA2PGQobLD1OAQ";
const SITE_ARCHITECT_AGENT_ID = "tLTD4kqITA2PGQobLD1OAg";
const DATA_ANALYST_AGENT_ID = "tLTD4kqITA2PGQobLD1OBg";
const CONTENT_SKILL_INSTALLATION_ID = "installation-content";
const SEO_SKILL_INSTALLATION_ID = "installation-seo";
const SKILL_CREATOR_INSTALLATION_ID = "installation-skill-creator";

describe("ArclayerAssistantProvider", () => {
  beforeEach(() => {
    runtimeCapture.external = null;
    runtimeCapture.remoteThreadId = "thread-1";
    for (const mock of Object.values(apiMocks)) mock.mockReset();
    useAIComposerDirectiveStore.setState({
      directivesByScope: { thread: [], home: [] },
    });
    apiMocks.getAgentThread.mockResolvedValue({
      threadId: "thread-1",
      activeRunId: null,
      messages: [],
    });
    apiMocks.createAgentRun.mockResolvedValue({ runId: "run-1" });
    apiMocks.initializeThread.mockResolvedValue({
      remoteId: "thread-created",
      externalId: "thread-created",
    });
    apiMocks.reloadThreads.mockResolvedValue(undefined);
    apiMocks.getAgentRunSnapshot.mockResolvedValue(runSnapshot);
    apiMocks.respondToAgentToolCall.mockResolvedValue({
      responseId: "response-1",
      toolCallId: "tool-call-human",
      checkpointId: "checkpoint-human",
      responseKind: "human_result",
      expectedSequence: 5,
    });
    apiMocks.resumeAgentRun.mockResolvedValue({});
    apiMocks.consumeAgentRunStream.mockImplementation(
      async ({ initialProjection }) => initialProjection,
    );
  });

  it("starts a server-owned Run with selected Skill IDs while preserving literal composer text", async () => {
    useAIComposerDirectiveStore.getState().addDirectives("thread", [
      { type: "agent", id: DATA_ANALYST_AGENT_ID, label: "Data Analyst" },
      { type: "agent", id: SITE_ARCHITECT_AGENT_ID, label: "Site Architect" },
      { type: "skill", id: CONTENT_SKILL_INSTALLATION_ID, label: "Content modeling" },
      { type: "skill", id: SEO_SKILL_INSTALLATION_ID, label: "SEO" },
    ]);
    render(
      <ArclayerAssistantProvider
        workspaceId="workspace-1"
        projectId="project-1"
        leadAgentId={COORDINATOR_AGENT_ID}
        executionMode="build"
        localize={(key) => key}
        initialTitle="New collaboration"
      >
        <div>Thread</div>
      </ArclayerAssistantProvider>,
    );

    await waitFor(() => {
      expect(apiMocks.getAgentThread).toHaveBeenCalledWith(
        "workspace-1",
        "thread-1",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    const onNew = runtimeCapture.external?.onNew as
      | ((message: {
          content: readonly { type: "text"; text: string }[];
          runConfig?: { custom?: Record<string, unknown> };
          metadata?: { custom?: Record<string, unknown> };
        }) => Promise<void>)
      | undefined;
    expect(onNew).toBeTypeOf("function");

    await act(async () => {
      await onNew?.({
        content: [{ type: "text", text: "Build the homepage" }],
        runConfig: {
          custom: {
            mentionedAgentIds: [DATA_ANALYST_AGENT_ID],
            selectedSkillInstallationIds: [CONTENT_SKILL_INSTALLATION_ID],
          },
        },
        metadata: { custom: { mentionedAgentIds: [SITE_ARCHITECT_AGENT_ID] } },
      });
    });

    expect(apiMocks.createAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        projectId: "project-1",
        threadId: "thread-1",
        leadAgentId: COORDINATOR_AGENT_ID,
        mentionedAgentIds: [DATA_ANALYST_AGENT_ID],
        selectedSkillInstallationIds: [CONTENT_SKILL_INSTALLATION_ID],
        executionMode: "build",
        message: "Build the homepage",
        idempotencyKey: expect.any(String),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(apiMocks.getAgentRunSnapshot).toHaveBeenCalledWith(
      "workspace-1",
      "run-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(apiMocks.consumeAgentRunStream).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", runId: "run-1" }),
    );
    expect(useAIComposerDirectiveStore.getState().directivesByScope.thread).toEqual([
      { type: "agent", id: SITE_ARCHITECT_AGENT_ID, label: "Site Architect" },
      { type: "skill", id: SEO_SKILL_INSTALLATION_ID, label: "SEO" },
    ]);
  });

  it("retains selected Skills when the server does not accept a Run", async () => {
    useAIComposerDirectiveStore
      .getState()
      .addDirectives("thread", [
        { type: "skill", id: CONTENT_SKILL_INSTALLATION_ID, label: "Content modeling" },
      ]);
    apiMocks.createAgentRun.mockRejectedValueOnce(new Error("Run rejected"));
    render(
      <ArclayerAssistantProvider
        workspaceId="workspace-1"
        projectId="project-1"
        leadAgentId={COORDINATOR_AGENT_ID}
        executionMode="build"
        localize={(key) => key}
        initialTitle="New collaboration"
      >
        <div>Thread</div>
      </ArclayerAssistantProvider>,
    );

    const onNew = runtimeCapture.external?.onNew as
      | ((message: {
          content: readonly { type: "text"; text: string }[];
          runConfig?: { custom?: Record<string, unknown> };
        }) => Promise<void>)
      | undefined;
    if (onNew === undefined) throw new Error("Expected the thread runtime to accept a message");

    await act(async () => {
      await expect(
        onNew({
          content: [{ type: "text", text: "Build the homepage" }],
          runConfig: {
            custom: { selectedSkillInstallationIds: [CONTENT_SKILL_INSTALLATION_ID] },
          },
        }),
      ).rejects.toThrow("errors:AGENT_RUN_FAILED");
    });

    expect(useAIComposerDirectiveStore.getState().directivesByScope.thread).toEqual([
      { type: "skill", id: CONTENT_SKILL_INSTALLATION_ID, label: "Content modeling" },
    ]);
  });

  it("materializes the registered Skill Creator chip as the backend slash command", async () => {
    useAIComposerDirectiveStore.getState().addDirectives("thread", [
      {
        type: "skill",
        id: SKILL_CREATOR_INSTALLATION_ID,
        label: "Skill Creator",
        command: "skill-creator",
      },
    ]);
    render(
      <ArclayerAssistantProvider
        workspaceId="workspace-1"
        projectId="project-1"
        leadAgentId={COORDINATOR_AGENT_ID}
        executionMode="build"
        localize={(key) => key}
        initialTitle="New collaboration"
      >
        <div>Thread</div>
      </ArclayerAssistantProvider>,
    );

    const onNew = runtimeCapture.external?.onNew as
      | ((message: {
          content: readonly { type: "text"; text: string }[];
          runConfig?: { custom?: Record<string, unknown> };
        }) => Promise<void>)
      | undefined;

    await act(async () => {
      await onNew?.({
        content: [
          {
            type: "text",
            text: `Plan first :skill[Skill Creator]{name=${SKILL_CREATOR_INSTALLATION_ID}} Build a review Skill`,
          },
        ],
        runConfig: {
          custom: {
            mentionedAgentIds: [],
            selectedSkillInstallationIds: [SKILL_CREATOR_INSTALLATION_ID],
          },
        },
      });
    });

    expect(apiMocks.createAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "/skill-creator Plan first Build a review Skill",
        selectedSkillInstallationIds: [SKILL_CREATOR_INSTALLATION_ID],
      }),
      expect.any(Object),
    );
  });

  it("initializes a fresh Thread before creating its first server-owned Run", async () => {
    runtimeCapture.remoteThreadId = null;
    apiMocks.getAgentRunSnapshot.mockResolvedValue({
      ...runSnapshot,
      threadId: "thread-created",
    });
    render(
      <ArclayerAssistantProvider
        workspaceId="workspace-1"
        projectId="project-1"
        leadAgentId={COORDINATOR_AGENT_ID}
        executionMode="build"
        localize={(key) => key}
        initialTitle="New collaboration"
      >
        <div>Thread</div>
      </ArclayerAssistantProvider>,
    );

    const onNew = runtimeCapture.external?.onNew as
      | ((message: {
          content: readonly { type: "text"; text: string }[];
          runConfig?: { custom?: Record<string, unknown> };
        }) => Promise<void>)
      | undefined;
    await act(async () => {
      await onNew?.({
        content: [{ type: "text", text: "First prompt" }],
        runConfig: { custom: { mentionedAgentIds: [], selectedSkillInstallationIds: [] } },
      });
    });

    expect(apiMocks.initializeThread).toHaveBeenCalledTimes(1);
    expect(apiMocks.reloadThreads).toHaveBeenCalledTimes(1);
    expect(apiMocks.createAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-created", message: "First prompt" }),
      expect.any(Object),
    );
    expect(apiMocks.getAgentThread).not.toHaveBeenCalled();
  });

  it("serializes queued prompts until the active Run reaches a terminal state", async () => {
    let finishFirstRun: (() => void) | undefined;
    apiMocks.createAgentRun
      .mockResolvedValueOnce({ runId: "run-1" })
      .mockResolvedValueOnce({ runId: "run-2" });
    apiMocks.getAgentRunSnapshot
      .mockResolvedValueOnce(runSnapshot)
      .mockResolvedValueOnce({ ...runSnapshot, runId: "run-2" });
    apiMocks.consumeAgentRunStream
      .mockImplementationOnce(async ({ initialProjection, onProjection }) => {
        await new Promise<void>((resolve) => {
          finishFirstRun = resolve;
        });
        onProjection({
          ...initialProjection,
          runStatus: "completed",
          run: { status: "completed" },
        });
        return initialProjection;
      })
      .mockImplementationOnce(async ({ initialProjection, onProjection }) => {
        onProjection({
          ...initialProjection,
          runStatus: "completed",
          run: { status: "completed" },
        });
        return initialProjection;
      });

    render(
      <ArclayerAssistantProvider
        workspaceId="workspace-1"
        projectId="project-1"
        leadAgentId={COORDINATOR_AGENT_ID}
        executionMode="build"
        localize={(key) => key}
        initialTitle="New collaboration"
      >
        <div>Thread</div>
      </ArclayerAssistantProvider>,
    );

    await waitFor(() => expect(apiMocks.getAgentThread).toHaveBeenCalledTimes(1));
    const queue = runtimeCapture.external?.queue as
      | {
          enqueue: (
            message: {
              role: "user";
              content: readonly { type: "text"; text: string }[];
              runConfig?: { custom?: Record<string, unknown> };
            },
            options: { steer: boolean },
          ) => void;
          items: readonly unknown[];
        }
      | undefined;
    expect(queue).toBeDefined();

    act(() => {
      queue?.enqueue(
        {
          role: "user",
          content: [{ type: "text", text: "First prompt" }],
          runConfig: {
            custom: {
              mentionedAgentIds: [DATA_ANALYST_AGENT_ID],
              selectedSkillInstallationIds: [CONTENT_SKILL_INSTALLATION_ID],
            },
          },
        },
        { steer: false },
      );
      queue?.enqueue(
        {
          role: "user",
          content: [{ type: "text", text: "Second prompt" }],
          runConfig: {
            custom: {
              mentionedAgentIds: [SITE_ARCHITECT_AGENT_ID],
              selectedSkillInstallationIds: [SEO_SKILL_INSTALLATION_ID],
            },
          },
        },
        { steer: false },
      );
    });

    await waitFor(() => expect(apiMocks.createAgentRun).toHaveBeenCalledTimes(1));
    expect(apiMocks.createAgentRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mentionedAgentIds: [DATA_ANALYST_AGENT_ID],
        selectedSkillInstallationIds: [CONTENT_SKILL_INSTALLATION_ID],
      }),
      expect.any(Object),
    );
    expect(queue?.items).toHaveLength(1);

    await act(async () => {
      finishFirstRun?.();
    });

    await waitFor(() => expect(apiMocks.createAgentRun).toHaveBeenCalledTimes(2));
    expect(apiMocks.createAgentRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: "Second prompt",
        mentionedAgentIds: [SITE_ARCHITECT_AGENT_ID],
        selectedSkillInstallationIds: [SEO_SKILL_INSTALLATION_ID],
        threadId: "thread-1",
      }),
      expect.any(Object),
    );
  });

  it("records and resumes a human Tool response through the durable backend", async () => {
    const toolMessage = {
      messageId: "message-tool",
      role: "assistant",
      agentId: COORDINATOR_AGENT_ID,
      createdAt: "2026-07-19T12:00:00.000Z",
      placement: { kind: "thread" },
      parts: [
        {
          partId: "part-tool",
          partIndex: 0,
          type: "tool-call",
          status: "running",
          toolCallId: "tool-call-human",
          toolName: "human.request_input",
          args: { variants: ["a", "b"] },
          argsText: '{"variants":["a","b"]}',
        },
      ],
    };
    apiMocks.getAgentThread.mockResolvedValue({
      threadId: "thread-1",
      activeRunId: "run-1",
      messages: [toolMessage],
    });
    apiMocks.getAgentRunSnapshot
      .mockResolvedValueOnce({
        ...runSnapshot,
        run: {
          status: "interrupted",
          interrupt: {
            interruptId: "interrupt-human",
            checkpointId: "checkpoint-human",
            reason: "human_tool_input",
            approvalId: null,
            toolCallId: "tool-call-human",
          },
        },
        messages: [toolMessage],
        lastSequence: 5,
        lastCursor: "cursor-5",
      })
      .mockResolvedValueOnce({
        ...runSnapshot,
        run: { status: "running", interrupt: null },
        messages: [toolMessage],
        lastSequence: 6,
        lastCursor: "cursor-6",
      });

    render(
      <ArclayerAssistantProvider
        workspaceId="workspace-1"
        projectId="project-1"
        leadAgentId={COORDINATOR_AGENT_ID}
        executionMode="build"
        localize={(key) => key}
        initialTitle="New collaboration"
      >
        <div>Thread</div>
      </ArclayerAssistantProvider>,
    );

    await waitFor(() => {
      expect(runtimeCapture.external?.onAddToolResult).toBeTypeOf("function");
    });
    const onAddToolResult = runtimeCapture.external?.onAddToolResult as
      | ((options: Record<string, unknown>) => Promise<void>)
      | undefined;
    await act(async () => {
      await onAddToolResult?.({
        messageId: "message-tool",
        toolName: "human.request_input",
        toolCallId: "tool-call-human",
        result: { variant: "a" },
        isError: false,
      });
    });

    expect(apiMocks.respondToAgentToolCall).toHaveBeenCalledWith(
      "workspace-1",
      "tool-call-human",
      expect.objectContaining({
        kind: "human_result",
        checkpointId: "checkpoint-human",
        result: { variant: "a" },
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(apiMocks.resumeAgentRun).toHaveBeenCalledWith(
      "workspace-1",
      "run-1",
      expect.objectContaining({
        responseId: "response-1",
        checkpointId: "checkpoint-human",
        expectedSequence: 5,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
