import { act, render, waitFor } from "@testing-library/react";
import type {
  AppendMessage,
  ExternalThreadQueueAdapter,
  ThreadMessageLike,
} from "@assistant-ui/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelAIAgentRun,
  chatStream,
  ensureAIConversationPersistedForRuntime,
  executeAIWorkspaceAction,
  sendAIAgentMessage,
} from "@/api/ai";
import { AIChatRuntimeProvider } from "@/components/ai/ai-chat-runtime";
import { DEFAULT_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type RuntimeStore = {
  messages: ThreadMessageLike[];
  isRunning?: boolean;
  isSendDisabled?: boolean;
  adapters?: {
    attachments?: unknown;
    dictation?: unknown;
  };
  onCancel?: () => Promise<void>;
  onReload?: (parentId: string | null, config: unknown) => Promise<void>;
  onEdit?: (message: AppendMessage) => Promise<void>;
  onNew?: (message: AppendMessage) => Promise<void>;
  queue?: ExternalThreadQueueAdapter;
  setMessages?: (messages: readonly ThreadMessageLike[]) => void;
};

const assistantUiMockState = vi.hoisted(() => ({
  runtimeStore: null as RuntimeStore | null,
}));

vi.mock("@assistant-ui/react", async () => {
  const actual = await vi.importActual<typeof import("@assistant-ui/react")>("@assistant-ui/react");
  return {
    ...actual,
    AssistantRuntimeProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
    WebSpeechDictationAdapter: {
      isSupported: () => false,
    },
    useExternalStoreRuntime: (store: RuntimeStore) => {
      assistantUiMockState.runtimeStore = store;
      return store;
    },
  };
});

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

vi.mock("@/api/ai", async () => {
  const actual = await vi.importActual<typeof import("@/api/ai")>("@/api/ai");

  return {
    ...actual,
    cancelAIAgentRun: vi.fn(),
    ensureAIConversationPersistedForRuntime: vi.fn(async () => undefined),
    sendAIAgentMessage: vi.fn(async () => undefined),
    executeAIWorkspaceAction: vi.fn(async () => ({
      kind: "chat",
      action: null,
      status: "routed_to_chat",
      content: "",
      executionSteps: [],
      toolCalls: [],
      projects: [],
      total: null,
    })),
    chatStream: vi.fn(async function* () {
      yield "new answer";
    }),
  };
});

describe("AIChatRuntimeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantUiMockState.runtimeStore = null;
    useAiChatStore.setState({
      conversations: [
        {
          id: "conversation-1",
          title: "Conversation",
          createdAt: 1,
          updatedAt: 1,
          messages: [
            { role: "user", content: "first prompt" },
            {
              role: "assistant",
              content: "first answer",
              agentRunId: "run-interrupt-1",
              agentStatus: "interrupted",
              agentThreadId: "agent-run:run-interrupt-1",
              agentCheckpointId: "run-interrupt-1:run.interrupted",
              agentInterrupt: {
                kind: "agent_run_approval",
                runId: "run-interrupt-1",
                agentId: "content_builder",
                mode: "build",
                prompt: "first prompt",
                toolOutputs: {},
                requiredDecision: "approved",
                threadId: "agent-run:run-interrupt-1",
                checkpointId: "run-interrupt-1:run.interrupted",
              },
              agentArtifact: {
                type: "agent_execution_plan",
                goal: "Plan editorial work",
                status: "planned",
                steps: [{ id: "step-1", title: "Review draft", status: "planned" }],
              },
            },
            { role: "user", content: "second prompt" },
            { role: "assistant", content: "stale answer" },
          ],
        },
      ],
      activeId: "conversation-1",
      streaming: false,
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedReasoningEffort: "medium",
      composerMode: "build",
      selectedAgentId: "content_analyzer",
      drawerOpen: false,
    });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
  });

  it("exposes backend-supported runtime actions and text attachments", () => {
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    expect(assistantUiMockState.runtimeStore?.messages.map((message) => message.id)).toEqual([
      "ai-message-0",
      "ai-message-1",
      "ai-message-2",
      "ai-message-3",
    ]);
    expect(assistantUiMockState.runtimeStore?.messages[1]?.metadata?.custom?.agentArtifact).toEqual(
      {
        type: "agent_execution_plan",
        goal: "Plan editorial work",
        status: "planned",
        steps: [{ id: "step-1", title: "Review draft", status: "planned" }],
      },
    );
    expect(assistantUiMockState.runtimeStore?.messages[1]?.metadata?.custom).toMatchObject({
      conversationId: "conversation-1",
      agentRunId: "run-interrupt-1",
      agentStatus: "interrupted",
      agentThreadId: "agent-run:run-interrupt-1",
      agentCheckpointId: "run-interrupt-1:run.interrupted",
      agentInterrupt: {
        kind: "agent_run_approval",
        runId: "run-interrupt-1",
        agentId: "content_builder",
        mode: "build",
        prompt: "first prompt",
        toolOutputs: {},
        requiredDecision: "approved",
        threadId: "agent-run:run-interrupt-1",
        checkpointId: "run-interrupt-1:run.interrupted",
      },
    });
    expect(assistantUiMockState.runtimeStore?.adapters?.attachments).toBeDefined();
    expect(assistantUiMockState.runtimeStore?.queue).toBeDefined();
    expect(assistantUiMockState.runtimeStore?.onReload).toBeTypeOf("function");
    expect(assistantUiMockState.runtimeStore?.onEdit).toBeTypeOf("function");
  });

  it("preserves agent run metadata when assistant-ui writes messages back to the store", () => {
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      assistantUiMockState.runtimeStore?.setMessages?.([
        { role: "user", content: "first prompt" },
        {
          role: "assistant",
          content: "",
          status: {
            type: "incomplete",
            reason: "error",
            error: "Tool failed",
          },
          metadata: {
            custom: {
              agentRunId: "run-failed-1",
              agentStatus: "failed",
              agentThreadId: "agent-run:run-failed-1",
              agentCheckpointId: "run-failed-1:run.failed",
              errorDetails: "TOOL_FAILED",
            },
          },
        },
      ] as ThreadMessageLike[]);
    });

    expect(useAiChatStore.getState().conversations[0]?.messages).toEqual([
      { role: "user", content: "first prompt" },
      {
        role: "assistant",
        content: "",
        agentRunId: "run-failed-1",
        agentStatus: "failed",
        agentThreadId: "agent-run:run-failed-1",
        agentCheckpointId: "run-failed-1:run.failed",
        error: true,
        errorMessage: "Tool failed",
        errorDetails: "TOOL_FAILED",
      },
    ]);
    expect(ensureAIConversationPersistedForRuntime).toHaveBeenCalledWith("conversation-1");
  });

  it("surfaces backend persistence failures after assistant-ui writes messages back", async () => {
    vi.mocked(ensureAIConversationPersistedForRuntime).mockRejectedValueOnce(
      new Error("Conversation persistence failed"),
    );
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      assistantUiMockState.runtimeStore?.setMessages?.([
        { role: "user", content: "edited prompt" },
      ] as ThreadMessageLike[]);
    });

    await waitFor(() => {
      expect(useAiChatStore.getState().conversations[0]?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "",
        error: true,
        errorMessage: "Conversation persistence failed",
        errorDetails: "Conversation persistence failed",
      });
    });
  });

  it("regenerates from the parent user message and persists the updated conversation", async () => {
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onReload?.("ai-message-2", {});
    });

    const messages = useAiChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages.map((message) => message.content)).toEqual([
      "first prompt",
      "first answer",
      "second prompt",
      "new answer",
    ]);
    expect(chatStream).toHaveBeenCalled();
    expect(sendAIAgentMessage).not.toHaveBeenCalled();
    expect(ensureAIConversationPersistedForRuntime).toHaveBeenCalled();
  });

  it("edits a user message through the runtime handler before sending again", async () => {
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onEdit?.({
        role: "user",
        content: [{ type: "text", text: "revised prompt" }],
        attachments: [],
        createdAt: new Date(),
        parentId: "ai-message-0",
        sourceId: "ai-message-0",
        runConfig: undefined,
        metadata: { custom: {} },
      } as AppendMessage);
    });

    const messages = useAiChatStore.getState().conversations[0]?.messages ?? [];
    expect(messages.map((message) => message.content)).toEqual(["revised prompt", "new answer"]);
    expect(chatStream).toHaveBeenCalled();
    expect(sendAIAgentMessage).not.toHaveBeenCalled();
    expect(ensureAIConversationPersistedForRuntime).toHaveBeenCalled();
  });

  it("stops edited messages from sending when persistence fails", async () => {
    vi.mocked(ensureAIConversationPersistedForRuntime).mockRejectedValueOnce(
      new Error("Conversation persistence failed"),
    );
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await expect(
      assistantUiMockState.runtimeStore?.onEdit?.({
        role: "user",
        content: [{ type: "text", text: "revised prompt" }],
        attachments: [],
        createdAt: new Date(),
        parentId: "ai-message-0",
        sourceId: "ai-message-0",
        runConfig: undefined,
        metadata: { custom: {} },
      } as AppendMessage),
    ).rejects.toThrow("Conversation persistence failed");

    expect(sendAIAgentMessage).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().conversations[0]?.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "",
      error: true,
      errorMessage: "Conversation persistence failed",
      errorDetails: "Conversation persistence failed",
    });
  });

  it("routes manual Build mode messages through chat mode", async () => {
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onNew?.(
        appendTextMessage("Build content operations"),
      );
    });

    expect(chatStream).toHaveBeenCalled();
    expect(sendAIAgentMessage).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().conversations[0]?.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "new answer",
    });
  });

  it("routes workspace project creation prompts through workspace actions", async () => {
    useAiChatStore.setState({ composerMode: "build" });
    vi.mocked(executeAIWorkspaceAction).mockResolvedValueOnce({
      kind: "tool_call",
      action: "create_project",
      status: "completed",
      content: "已在当前工作区创建项目“内容实验室”。",
      plan: "创建一个内容实验室项目。",
      executionSteps: [
        { id: "planner", title: "理解指令并选择工作区工具", status: "completed" },
        {
          id: "tool-call",
          title: "调用 workspace.create_project",
          status: "completed",
          toolName: "workspace.create_project",
        },
      ],
      toolCalls: [
        {
          toolName: "workspace.create_project",
          status: "completed",
          arguments: { name: "内容实验室" },
        },
      ],
      project: {
        id: "project-created",
        name: "内容实验室",
        slug: "project",
        description: null,
      },
      projects: [],
      total: null,
      navigation: { label: "进入项目", path: "/projects/project-created" },
    });
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onNew?.(appendTextMessage("帮我创建一个随机项目"));
    });

    expect(executeAIWorkspaceAction).toHaveBeenCalledWith("帮我创建一个随机项目", {
      signal: expect.any(AbortSignal),
      projectId: "project-1",
    });
    expect(chatStream).not.toHaveBeenCalled();
    expect(sendAIAgentMessage).not.toHaveBeenCalled();
    expect(useAiChatStore.getState().conversations[0]?.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "已在当前工作区创建项目“内容实验室”。",
      workspaceAction: {
        type: "workspace_project_created",
        project: {
          id: "project-created",
          name: "内容实验室",
          slug: "project",
        },
      },
    });
  });

  it("does not start an agent run for empty runtime messages", async () => {
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );
    const beforeMessages = useAiChatStore.getState().conversations[0]?.messages;

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onNew?.(appendTextMessage("   \n\t  "));
    });

    expect(sendAIAgentMessage).not.toHaveBeenCalled();
    expect(assistantUiMockState.runtimeStore?.isRunning).toBe(false);
    expect(useAiChatStore.getState().conversations[0]?.messages).toBe(beforeMessages);
  });

  it("disables sending when the runtime has no current conversation", async () => {
    render(
      <AIChatRuntimeProvider conversationId="missing-conversation">
        <div />
      </AIChatRuntimeProvider>,
    );

    expect(assistantUiMockState.runtimeStore?.isSendDisabled).toBe(true);

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onNew?.(appendTextMessage("Build orphan work"));
    });

    expect(sendAIAgentMessage).not.toHaveBeenCalled();
    expect(
      useAiChatStore.getState().conversations[0]?.messages.map((message) => message.content),
    ).toEqual(["first prompt", "first answer", "second prompt", "stale answer"]);
  });

  it("routes manual Plan mode messages through chat mode", async () => {
    useAiChatStore.setState({ composerMode: "plan" });
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onNew?.(
        appendTextMessage("Plan the editorial work"),
      );
    });

    expect(chatStream).toHaveBeenCalled();
    expect(sendAIAgentMessage).not.toHaveBeenCalled();
  });

  it("uses localized copy for planned workspace creation messages", async () => {
    useAiChatStore.setState({ composerMode: "plan" });
    vi.mocked(executeAIWorkspaceAction).mockResolvedValueOnce({
      kind: "tool_call",
      action: "create_project",
      status: "planned",
      content: "我已整理好执行方案。规划模式不会直接修改工作区。",
      plan: "规划创建一个发布项目。",
      executionSteps: [
        {
          id: "planner",
          title: "理解指令并选择工作区工具",
          status: "completed",
          detail: "规划创建一个发布项目。",
        },
        {
          id: "tool.create_project",
          title: "准备调用 workspace.create_project",
          status: "planned",
          toolName: "workspace.create_project",
        },
      ],
      toolCalls: [
        {
          toolName: "workspace.create_project",
          status: "planned",
          arguments: { name: "发布项目" },
        },
      ],
      projects: [],
      total: null,
    });
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onNew?.(
        appendTextMessage("Create a launch project"),
      );
    });

    const lastMessage = useAiChatStore.getState().conversations[0]?.messages.at(-1);
    expect(chatStream).not.toHaveBeenCalled();
    expect(lastMessage).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("规划模式不会直接修改工作区"),
      agentArtifact: expect.objectContaining({
        type: "agent_execution_plan",
        status: "planned",
        steps: expect.arrayContaining([
          expect.objectContaining({ title: expect.stringContaining("理解指令") }),
          expect.objectContaining({ toolName: "workspace.create_project" }),
        ]),
      }),
    });
    expect(lastMessage?.content).not.toContain("I prepared an executable proposal");
  });

  it("routes manual Agent mode messages to the selected agent", async () => {
    useAiChatStore.setState({
      composerMode: "agent",
      selectedAgentId: "content_model_advisor",
    });
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onNew?.(appendTextMessage("Review this model"));
    });

    expect(sendAIAgentMessage).toHaveBeenCalledWith(
      "conversation-1",
      "Review this model",
      expect.objectContaining({ agentId: "content_model_advisor" }),
    );
  });

  it("persists a cancelled agent run from the runtime cancel handler", async () => {
    useAiChatStore.setState({
      composerMode: "agent",
      selectedAgentId: "content_builder",
      conversations: [
        {
          id: "conversation-1",
          title: "Conversation",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      ],
    });
    let resolveRun!: () => void;
    vi.mocked(sendAIAgentMessage).mockImplementation(async (conversationId, text, options) => {
      useAiChatStore.getState().appendMessage(conversationId, { role: "user", content: text });
      useAiChatStore.getState().appendDelta(conversationId, "");
      options?.onRunCreated?.("run-cancel-1");
      await new Promise<void>((resolve) => {
        resolveRun = resolve;
      });
    });
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      void assistantUiMockState.runtimeStore?.onNew?.(appendTextMessage("Build a draft"));
    });

    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalled());
    await act(async () => {
      await assistantUiMockState.runtimeStore?.onCancel?.();
    });

    expect(cancelAIAgentRun).toHaveBeenCalledWith("project-1", "run-cancel-1");
    expect(useAiChatStore.getState().conversations[0]?.messages.at(-1)).toMatchObject({
      role: "assistant",
      agentRunId: "run-cancel-1",
      agentStatus: "cancelled",
    });
    expect(ensureAIConversationPersistedForRuntime).toHaveBeenLastCalledWith("conversation-1");
    resolveRun();
  });

  it("aborts the active request when backend run cancellation fails", async () => {
    useAiChatStore.setState({
      composerMode: "agent",
      selectedAgentId: "content_builder",
      conversations: [
        {
          id: "conversation-1",
          title: "Conversation",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      ],
    });
    let requestSignal: AbortSignal | undefined;
    vi.mocked(cancelAIAgentRun).mockRejectedValueOnce(new Error("Cancel failed"));
    vi.mocked(sendAIAgentMessage).mockImplementation(async (_conversationId, _text, options) => {
      requestSignal = options?.signal;
      options?.onRunCreated?.("run-cancel-1");
      await new Promise<void>((resolve) => {
        options?.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      void assistantUiMockState.runtimeStore?.onNew?.(appendTextMessage("Build a draft"));
    });
    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalled());

    await expect(assistantUiMockState.runtimeStore?.onCancel?.()).rejects.toThrow("Cancel failed");

    expect(cancelAIAgentRun).toHaveBeenCalledWith("project-1", "run-cancel-1");
    expect(requestSignal?.aborted).toBe(true);
    expect(useAiChatStore.getState().conversations[0]?.messages.at(-1)?.agentStatus).not.toBe(
      "cancelled",
    );
  });

  it("queues composer messages while an agent run is active and drains them FIFO", async () => {
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    const pendingRuns: Array<() => void> = [];
    vi.mocked(sendAIAgentMessage).mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          pendingRuns.push(resolve);
        }),
    );
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("first queued prompt"), {
        steer: false,
      });
    });
    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(1));

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("second queued prompt"), {
        steer: false,
      });
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("third queued prompt"), {
        steer: false,
      });
    });

    expect(sendAIAgentMessage).toHaveBeenCalledTimes(1);
    expect(assistantUiMockState.runtimeStore?.queue?.items.map((item) => item.prompt)).toEqual([
      "second queued prompt",
      "third queued prompt",
    ]);

    await act(async () => {
      pendingRuns[0]?.();
    });
    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(2));
    expect(sendAIAgentMessage).toHaveBeenLastCalledWith(
      "conversation-1",
      "second queued prompt",
      expect.objectContaining({ agentId: "content_builder" }),
    );
    expect(assistantUiMockState.runtimeStore?.queue?.items.map((item) => item.prompt)).toEqual([
      "third queued prompt",
    ]);

    await act(async () => {
      pendingRuns[1]?.();
    });
    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(3));
    expect(sendAIAgentMessage).toHaveBeenLastCalledWith(
      "conversation-1",
      "third queued prompt",
      expect.objectContaining({ agentId: "content_builder" }),
    );
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);

    await act(async () => {
      pendingRuns[2]?.();
    });
  });

  it("clears queued composer messages before editing a previous user message", async () => {
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    const pendingRuns: Array<() => void> = [];
    vi.mocked(sendAIAgentMessage).mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          pendingRuns.push(resolve);
        }),
    );
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("active prompt"), {
        steer: false,
      });
    });
    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(1));

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("stale queued prompt"), {
        steer: false,
      });
    });
    expect(assistantUiMockState.runtimeStore?.queue?.items.map((item) => item.prompt)).toEqual([
      "stale queued prompt",
    ]);

    let editPromise: Promise<void> | undefined;
    act(() => {
      editPromise = assistantUiMockState.runtimeStore?.onEdit?.({
        role: "user",
        content: [{ type: "text", text: "revised prompt" }],
        attachments: [],
        createdAt: new Date(),
        parentId: "ai-message-0",
        sourceId: "ai-message-0",
        runConfig: undefined,
        metadata: { custom: {} },
      } as AppendMessage);
    });

    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(2));
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);
    expect(sendAIAgentMessage).toHaveBeenLastCalledWith(
      "conversation-1",
      "revised prompt",
      expect.objectContaining({ agentId: "content_builder" }),
    );

    await act(async () => {
      pendingRuns[1]?.();
      await editPromise;
      pendingRuns[0]?.();
    });
    expect(sendAIAgentMessage).toHaveBeenCalledTimes(2);
  });

  it("clears queued composer messages before regenerating a previous response", async () => {
    useAiChatStore.setState({ composerMode: "agent", selectedAgentId: "content_builder" });
    const pendingRuns: Array<() => void> = [];
    vi.mocked(sendAIAgentMessage).mockImplementation(
      async () =>
        new Promise<void>((resolve) => {
          pendingRuns.push(resolve);
        }),
    );
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("active prompt"), {
        steer: false,
      });
    });
    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(1));

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("stale queued prompt"), {
        steer: false,
      });
    });
    expect(assistantUiMockState.runtimeStore?.queue?.items.map((item) => item.prompt)).toEqual([
      "stale queued prompt",
    ]);

    let reloadPromise: Promise<void> | undefined;
    act(() => {
      reloadPromise = assistantUiMockState.runtimeStore?.onReload?.("ai-message-2", {});
    });

    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(2));
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);
    expect(sendAIAgentMessage).toHaveBeenLastCalledWith(
      "conversation-1",
      "second prompt",
      expect.objectContaining({ agentId: "content_builder" }),
    );

    await act(async () => {
      pendingRuns[1]?.();
      await reloadPromise;
      pendingRuns[0]?.();
    });
    expect(sendAIAgentMessage).toHaveBeenCalledTimes(2);
  });

  it("clears queued composer messages when the active agent run is cancelled", async () => {
    useAiChatStore.setState({
      composerMode: "agent",
      selectedAgentId: "content_builder",
      conversations: [
        {
          id: "conversation-1",
          title: "Conversation",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        },
      ],
    });
    let resolveRun!: () => void;
    vi.mocked(sendAIAgentMessage).mockImplementation(async (conversationId, text, options) => {
      useAiChatStore.getState().appendMessage(conversationId, { role: "user", content: text });
      useAiChatStore.getState().appendDelta(conversationId, "");
      options?.onRunCreated?.("run-cancel-1");
      await new Promise<void>((resolve) => {
        resolveRun = resolve;
      });
    });
    render(
      <AIChatRuntimeProvider conversationId="conversation-1">
        <div />
      </AIChatRuntimeProvider>,
    );

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("first prompt"), {
        steer: false,
      });
    });
    await waitFor(() => expect(sendAIAgentMessage).toHaveBeenCalledTimes(1));

    act(() => {
      assistantUiMockState.runtimeStore?.queue?.enqueue(appendTextMessage("queued prompt"), {
        steer: false,
      });
    });
    expect(assistantUiMockState.runtimeStore?.queue?.items.map((item) => item.prompt)).toEqual([
      "queued prompt",
    ]);

    await act(async () => {
      await assistantUiMockState.runtimeStore?.onCancel?.();
    });
    expect(assistantUiMockState.runtimeStore?.queue?.items).toEqual([]);

    await act(async () => {
      resolveRun();
    });
    expect(sendAIAgentMessage).toHaveBeenCalledTimes(1);
  });
});
