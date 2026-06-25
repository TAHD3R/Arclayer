import { api } from "@/lib/http";
import { getAppConfig } from "@/lib/config/app-config";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  useAiChatStore,
  type AIReasoningEffort,
  type AIChatMessage as StoreAIChatMessage,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface AIChatResponse {
  id: string;
  model: string;
  content: string;
  usage: AIChatUsage;
  finish_reason: string;
}

export interface AIModelCatalogItem {
  id: string;
  provider: string;
  label: string;
  labelKey?: string | null;
  description?: string | null;
  descriptionKey?: string | null;
  available: boolean;
}

export interface AIModelCatalogResponse {
  defaultModel: string;
  models: AIModelCatalogItem[];
}

export interface AIChatOptions {
  signal?: AbortSignal;
  model?: string;
  reasoningEffort?: AIReasoningEffort;
}

export type AgentRunEventName =
  | "run.created"
  | "message.delta"
  | "tool.started"
  | "tool.completed"
  | "run.completed"
  | "run.cancelled"
  | "run.failed";

export interface AgentRunEvent {
  event: AgentRunEventName;
  data: Record<string, unknown>;
}

export type AgentRunStatus = "queued" | "running" | "completed" | "cancelled" | "failed";

export interface AgentRunState {
  id: string;
  agentId: string;
  status: AgentRunStatus;
  prompt: string;
  model?: string | null;
  result?: Record<string, unknown> | null;
  toolOutputs?: Record<string, unknown>;
  events?: AgentRunEvent[];
  cancellationRequested?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface AgentRunStreamOptions extends AIChatOptions {
  agentId: string;
  prompt: string;
  toolInputs?: Record<string, Record<string, unknown>>;
}

export interface SendAIAgentMessageOptions {
  signal?: AbortSignal;
  onRunCreated?: (runId: string) => void;
}

const MAX_AI_ERROR_DETAIL_LENGTH = 12_000;
const AI_ERROR_MESSAGES: Record<string, string> = {
  AUTH_NO_KEY:
    "当前工作区还没有可用的 AI 模型密钥。请先配置 LiteLLM virtual key，或在本地开发环境启用 AI mock 模式。",
  AUTH_NOT_WORKSPACE_MEMBER: "AI 请求缺少有效的工作区上下文，请重新进入一个工作区后再试。",
};

export class AIChatRequestError extends Error {
  readonly details: string;
  readonly status?: number;

  constructor(message: string, details: string, status?: number) {
    super(message);
    this.name = "AIChatRequestError";
    this.details = details;
    this.status = status;
  }
}

function pickErrorMessage(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const code = pickErrorCode(record);
  if (code && AI_ERROR_MESSAGES[code]) return AI_ERROR_MESSAGES[code];

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  const detail = record.detail;
  if (detail && typeof detail === "object") {
    const detailRecord = detail as Record<string, unknown>;
    const detailCode = pickErrorCode(detailRecord);
    if (detailCode && AI_ERROR_MESSAGES[detailCode]) return AI_ERROR_MESSAGES[detailCode];
    if (typeof detailRecord.message === "string" && detailRecord.message.trim()) {
      return detailRecord.message.trim();
    }
  }

  const nested = record.error;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.message === "string" && nestedRecord.message.trim()) {
      return nestedRecord.message.trim();
    }
  }

  return null;
}

function pickErrorCode(record: Record<string, unknown>): string | null {
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  if (typeof record.code === "string" && record.code.trim()) return record.code.trim();

  const nested = record.error;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.code === "string" && nestedRecord.code.trim()) {
      return nestedRecord.code.trim();
    }
  }

  return null;
}

export function formatAIChatError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const trimmed = raw.trim();

  if (!trimmed) return "AI 请求失败";

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return pickErrorMessage(parsed) ?? trimmed;
  } catch {
    return trimmed;
  }
}

function formatAIChatErrorDetails(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const detail = (() => {
    try {
      return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
    } catch {
      return trimmed;
    }
  })();

  if (detail.length <= MAX_AI_ERROR_DETAIL_LENGTH) return detail;
  return `${detail.slice(0, MAX_AI_ERROR_DETAIL_LENGTH)}\n\n[truncated error detail: showing first ${MAX_AI_ERROR_DETAIL_LENGTH} characters]`;
}

export function getAIChatErrorDetails(error: unknown): string {
  if (error instanceof AIChatRequestError) return error.details;
  if (error instanceof Error) return error.message;
  return String(error || "");
}

export async function chat(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): Promise<AIChatResponse> {
  return api.post<AIChatResponse>(
    "/chat",
    buildChatRequestBody(messages, options),
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function listAIModels(options: {
  workspaceId: string;
  signal?: AbortSignal;
}): Promise<AIModelCatalogResponse> {
  const query = new URLSearchParams({ workspaceId: options.workspaceId });
  return api.get<AIModelCatalogResponse>(
    `/chat/models?${query.toString()}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function* chatStream(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): AsyncGenerator<string> {
  const response = await fetch(buildApiUrl("/chat?stream=true"), {
    method: "POST",
    headers: buildStreamHeaders(),
    body: JSON.stringify(buildChatRequestBody(messages, options)),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const raw = errorBody || `Chat API error: ${response.status} ${response.statusText}`;
    throw new AIChatRequestError(
      formatAIChatError(raw),
      formatAIChatErrorDetails(raw),
      response.status,
    );
  }

  if (!response.body) {
    throw new Error("Response body is empty");
  }

  for await (const event of readSseEvents(response)) {
    if (event.event === "error") {
      throw new AIChatRequestError(
        formatAIChatError(event.rawData),
        formatAIChatErrorDetails(event.rawData),
      );
    }
    if (event.event === "message.delta" && typeof event.data.content === "string") {
      yield event.data.content;
    }
  }
}

export async function* agentRunStream(
  projectId: string,
  options: AgentRunStreamOptions,
): AsyncGenerator<AgentRunEvent> {
  const response = await fetch(
    buildApiUrl(`/projects/${encodeURIComponent(projectId)}/agents/runs/stream`),
    {
      method: "POST",
      headers: buildStreamHeaders(),
      body: JSON.stringify({
        agentId: options.agentId,
        prompt: options.prompt,
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        toolInputs: options.toolInputs ?? {},
      }),
      signal: options.signal,
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const raw = errorBody || `Agent API error: ${response.status} ${response.statusText}`;
    throw new AIChatRequestError(
      formatAIChatError(raw),
      formatAIChatErrorDetails(raw),
      response.status,
    );
  }

  for await (const event of readSseEvents(response)) {
    if (event.event === "run.failed" || event.event === "error") {
      throw new AIChatRequestError(
        formatAIChatError(JSON.stringify(event.data)),
        formatAIChatErrorDetails(JSON.stringify(event.data)),
      );
    }
    yield {
      event: event.event as AgentRunEventName,
      data: event.data,
    };
  }
}

export async function getAIAgentRun(
  projectId: string,
  runId: string,
  options?: { signal?: AbortSignal },
): Promise<AgentRunState> {
  return api.get<AgentRunState>(
    `/projects/${encodeURIComponent(projectId)}/agents/runs/${encodeURIComponent(runId)}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function cancelAIAgentRun(
  projectId: string,
  runId: string,
  options?: { signal?: AbortSignal },
): Promise<AgentRunState> {
  return api.post<AgentRunState>(
    `/projects/${encodeURIComponent(projectId)}/agents/runs/${encodeURIComponent(runId)}/cancel`,
    undefined,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function sendAIAgentMessage(
  conversationId: string,
  text: string,
  options?: SendAIAgentMessageOptions,
): Promise<void> {
  return sendAIAgentMessageWithSignal(conversationId, text, options);
}

async function sendAIAgentMessageWithSignal(
  conversationId: string,
  text: string,
  options?: SendAIAgentMessageOptions,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const state = useAiChatStore.getState();
  const projectId = useWorkspaceStore.getState().currentProjectId;
  if (!projectId) {
    throw new Error("Agent mode requires an active project context");
  }

  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }

  state.appendMessage(conversationId, { role: "user", content: trimmed });
  state.appendDelta(conversationId, "");
  state.setStreaming(true);
  let activeRunId: string | null = null;

  try {
    for await (const event of agentRunStream(projectId, {
      agentId: state.selectedAgentId,
      prompt: trimmed,
      model: state.selectedModel,
      reasoningEffort: state.selectedReasoningEffort,
      toolInputs: buildAgentToolInputs(state.selectedAgentId, trimmed),
      signal: options?.signal,
    })) {
      if (event.event === "run.created") {
        const runId = readRunId(event.data);
        if (runId) {
          activeRunId = runId;
          options?.onRunCreated?.(runId);
          useAiChatStore
            .getState()
            .setLastAssistantAgentRun(conversationId, { runId, status: "running" });
        }
      }
      if (event.event === "message.delta" && typeof event.data.content === "string") {
        useAiChatStore.getState().appendDelta(conversationId, event.data.content);
      }
      if (event.event === "run.completed" && activeRunId) {
        useAiChatStore
          .getState()
          .setLastAssistantAgentRun(conversationId, { runId: activeRunId, status: "completed" });
      }
      if (event.event === "run.cancelled" && activeRunId) {
        useAiChatStore
          .getState()
          .setLastAssistantAgentRun(conversationId, { runId: activeRunId, status: "cancelled" });
      }
      if (event.event === "run.failed") {
        throw new AIChatRequestError(
          formatAIChatError(JSON.stringify(event.data)),
          formatAIChatErrorDetails(JSON.stringify(event.data)),
        );
      }
    }
    useAiChatStore.getState().finalizeLastAssistant(conversationId);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      useAiChatStore.getState().finalizeLastAssistant(conversationId);
      return;
    }
    let recovered = false;
    let recoveryError: unknown = null;
    if (activeRunId) {
      try {
        await recoverAIAgentRun(projectId, conversationId, activeRunId);
        recovered = true;
      } catch (recoveryErr) {
        recoveryError = recoveryErr;
      }
    }
    if (recovered) {
      return;
    }
    const message = formatAIChatError(err);
    const details = [
      getAIChatErrorDetails(err),
      recoveryError ? `Agent run recovery failed: ${getAIChatErrorDetails(recoveryError)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    useAiChatStore.getState().finalizeLastAssistant(conversationId, {
      error: true,
      errorMessage: message,
      errorDetails: details,
    });
  } finally {
    useAiChatStore.getState().setStreaming(false);
  }
}

async function recoverAIAgentRun(
  projectId: string,
  conversationId: string,
  runId: string,
): Promise<void> {
  const run = await getAIAgentRun(projectId, runId);
  const status = toMessageAgentStatus(run.status);
  useAiChatStore.getState().setLastAssistantAgentRun(conversationId, { runId, status });

  if (run.status === "completed") {
    replaceLastAssistantMessage(conversationId, {
      content: readRunContent(run),
      streaming: false,
      error: false,
      agentRunId: runId,
      agentStatus: "completed",
    });
    return;
  }

  if (run.status === "cancelled") {
    replaceLastAssistantMessage(conversationId, {
      content: readRunContent(run),
      streaming: false,
      error: false,
      agentRunId: runId,
      agentStatus: "cancelled",
    });
    return;
  }

  if (run.status === "failed") {
    throw new AIChatRequestError(
      run.errorMessage || run.errorCode || "Agent run failed",
      formatAIChatErrorDetails(JSON.stringify(run)),
    );
  }

  throw new AIChatRequestError(
    `Agent run is still ${run.status}`,
    formatAIChatErrorDetails(JSON.stringify(run)),
  );
}

function replaceLastAssistantMessage(
  conversationId: string,
  patch: Partial<StoreAIChatMessage>,
): void {
  const state = useAiChatStore.getState();
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }

  const messages = [...conversation.messages];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    messages[index] = { ...message, ...patch };
    state.replaceMessages(conversationId, messages);
    return;
  }

  throw new Error(`AI conversation has no assistant message to recover: ${conversationId}`);
}

function readRunContent(run: AgentRunState): string {
  const resultContent = run.result?.content;
  if (typeof resultContent === "string") return resultContent;
  return (run.events ?? [])
    .filter((event) => event.event === "message.delta")
    .map((event) => event.data.content)
    .filter((content): content is string => typeof content === "string")
    .join("");
}

function toMessageAgentStatus(
  status: AgentRunStatus,
): "running" | "completed" | "cancelled" | "failed" {
  if (status === "completed" || status === "cancelled" || status === "failed") return status;
  return "running";
}

function readRunId(data: Record<string, unknown>): string | null {
  const value = data.runId;
  return typeof value === "string" && value.trim() ? value : null;
}

function buildApiUrl(path: string): string {
  const config = getAppConfig();
  const baseUrl = config.apiBaseUrl || "";
  const prefix = config.apiPrefix || "";
  const urlPath = `${prefix}${path}`;
  return baseUrl ? `${baseUrl}${urlPath}` : urlPath;
}

function buildChatRequestBody(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): Record<string, unknown> {
  return {
    messages,
    workspaceId: readCurrentWorkspaceId(),
    model: options?.model,
    reasoningEffort: options?.reasoningEffort,
  };
}

function readCurrentWorkspaceId(): string | null {
  const state = useWorkspaceStore.getState();
  return state.currentWorkspaceId ?? state.lastWorkspaceId ?? null;
}

function buildAgentToolInputs(
  agentId: string,
  prompt: string,
): Record<string, Record<string, unknown>> {
  if (agentId === "content_model_advisor") {
    return {
      list_content_types: { page: 1, size: 10, q: prompt.slice(0, 64) },
    };
  }

  return {
    search_content: { page: 1, size: 10, modelKey: null },
  };
}

function buildStreamHeaders(): Record<string, string> {
  const accessToken = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function* readSseEvents(response: Response): AsyncGenerator<{
  event: string;
  data: Record<string, unknown>;
  rawData: string;
}> {
  if (!response.body) {
    throw new Error("Response body is empty");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    // eslint-disable-next-line no-await-in-loop -- ReadableStream chunks must be consumed sequentially.
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (!event) continue;
      if (event.rawData === "[DONE]") return;
      yield event;
    }
  }

  if (buffer.trim()) {
    const event = parseSseChunk(buffer);
    if (event && event.rawData !== "[DONE]") {
      yield event;
    }
  }
}

function parseSseChunk(
  chunk: string,
): { event: string; data: Record<string, unknown>; rawData: string } | null {
  let event = "";
  const dataLines: string[] = [];

  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.replace(/^event:\s*/, "");
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.replace(/^data:\s*/, ""));
    }
  }

  const rawData = dataLines.join("\n");
  if (!event && !rawData) return null;

  try {
    return { event, data: JSON.parse(rawData) as Record<string, unknown>, rawData };
  } catch (err) {
    if (err instanceof SyntaxError) return { event, data: { content: rawData }, rawData };
    throw err;
  }
}
