import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock, apiPostMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
}));

vi.mock("@/lib/http", () => ({
  api: {
    get: apiGetMock,
    post: apiPostMock,
  },
}));

vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({ apiBaseUrl: "", apiPrefix: "/api/v1" }),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: {
    getState: () => ({ accessToken: null }),
  },
}));

import {
  cancelAIAgentRun,
  chat,
  chatStream,
  formatAIChatError,
  listAIModels,
  sendAIAgentMessage,
} from "@/api/ai";
import {
  DEFAULT_AI_AGENT_ID,
  DEFAULT_AI_CHAT_MODEL,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function sseResponse(chunks: string[], error?: Error): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        const chunk = chunks[index];
        if (chunk) {
          index += 1;
          controller.enqueue(encoder.encode(chunk));
          return;
        }
        if (error) {
          controller.error(error);
          return;
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("AI agent API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAiChatStore.setState({
      conversations: [],
      activeId: null,
      streaming: false,
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedAgentId: DEFAULT_AI_AGENT_ID,
      composerMode: "agent",
      drawerOpen: false,
    });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-last",
      currentProjectId: "project-1",
    });
  });

  it("sends workspace context for non-streaming chat", async () => {
    apiPostMock.mockResolvedValue({
      id: "chat-1",
      model: "gpt-4o-mini",
      content: "done",
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    });

    await chat([{ role: "user", content: "Hello" }], { model: "gpt-4o-mini" });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/chat",
      {
        messages: [{ role: "user", content: "Hello" }],
        workspaceId: "workspace-1",
        model: "gpt-4o-mini",
        reasoningEffort: undefined,
      },
      undefined,
    );
  });

  it("sends selected reasoning effort for non-streaming chat", async () => {
    apiPostMock.mockResolvedValue({
      id: "chat-2",
      model: "deepseek-v4-pro",
      content: "done",
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    });

    await chat([{ role: "user", content: "Hello" }], {
      model: "deepseek-v4-pro",
      reasoningEffort: "high",
    });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/chat",
      {
        messages: [{ role: "user", content: "Hello" }],
        workspaceId: "workspace-1",
        model: "deepseek-v4-pro",
        reasoningEffort: "high",
      },
      undefined,
    );
  });

  it("sends workspace context for streaming chat", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const chunks: string[] = [];
    for await (const chunk of chatStream([{ role: "user", content: "Hello" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/chat?stream=true");
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: "user", content: "Hello" }],
      workspaceId: "workspace-1",
    });
  });

  it("loads selectable chat models from the backend catalog", async () => {
    apiGetMock.mockResolvedValue({
      defaultModel: "deepseek-v4-pro",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          labelKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO",
          available: true,
        },
      ],
    });

    const catalog = await listAIModels({ workspaceId: "workspace-1" });

    expect(apiGetMock).toHaveBeenCalledWith("/chat/models?workspaceId=workspace-1", undefined);
    expect(catalog.defaultModel).toBe("deepseek-v4-pro");
    expect(catalog.models[0]?.id).toBe("deepseek-v4-pro");
  });

  it("formats workspace and key configuration errors from backend detail envelopes", () => {
    expect(
      formatAIChatError(
        JSON.stringify({
          detail: {
            message: "No valid LiteLLM virtual key available for this workspace",
            error: "AUTH_NO_KEY",
          },
        }),
      ),
    ).toContain("还没有可用的 AI 模型密钥");
  });

  it("stores agent run id and completion status from the stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'event: run.created\ndata: {"runId":"run-1","agentId":"content_analyzer"}\n\n',
            'event: message.delta\ndata: {"content":"done"}\n\n',
            'event: run.completed\ndata: {"runId":"run-1"}\n\n',
          ]),
        ),
    );
    const onRunCreated = vi.fn();
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Inspect content", { onRunCreated });

    const init = (vi.mocked(fetch).mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      agentId: DEFAULT_AI_AGENT_ID,
      model: DEFAULT_AI_CHAT_MODEL,
      reasoningEffort: "medium",
    });
    const conversation = useAiChatStore.getState().conversations[0];
    expect(onRunCreated).toHaveBeenCalledWith("run-1");
    expect(conversation.messages).toEqual([
      { role: "user", content: "Inspect content" },
      {
        role: "assistant",
        content: "done",
        streaming: false,
        error: false,
        errorMessage: undefined,
        errorDetails: undefined,
        agentRunId: "run-1",
        agentStatus: "completed",
      },
    ]);
  });

  it("recovers a completed run when the stream disconnects after run.created", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            ['event: run.created\ndata: {"runId":"run-2","agentId":"content_analyzer"}\n\n'],
            new Error("network down"),
          ),
        ),
    );
    apiGetMock.mockResolvedValue({
      id: "run-2",
      agentId: "content_analyzer",
      status: "completed",
      prompt: "Inspect content",
      result: { content: "recovered result" },
      toolOutputs: {},
      events: [],
    });
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Inspect content");

    expect(apiGetMock).toHaveBeenCalledWith("/projects/project-1/agents/runs/run-2", undefined);
    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "recovered result",
      streaming: false,
      error: false,
      agentRunId: "run-2",
      agentStatus: "completed",
    });
  });

  it("calls the backend cancel endpoint for agent runs", async () => {
    apiPostMock.mockResolvedValue({
      id: "run-3",
      agentId: "content_analyzer",
      status: "cancelled",
      prompt: "Inspect content",
    });

    await cancelAIAgentRun("project-1", "run-3");

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/runs/run-3/cancel",
      undefined,
      undefined,
    );
  });
});
