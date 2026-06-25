import { api } from "@/lib/http";
import { getAppConfig } from "@/lib/config/app-config";
import { useAuthStore } from "@/stores/use-auth-store";

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

export interface AIChatOptions {
  signal?: AbortSignal;
  model?: string;
}

const MAX_AI_ERROR_DETAIL_LENGTH = 12_000;

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

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
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
    { messages, model: options?.model },
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function* chatStream(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): AsyncGenerator<string> {
  const config = getAppConfig();
  const baseUrl = config.apiBaseUrl || "";
  const prefix = config.apiPrefix || "";
  const path = `${prefix}/chat?stream=true`;
  const url = baseUrl ? `${baseUrl}${path}` : path;

  const accessToken = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, model: options?.model }),
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

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  let currentEvent = "";

  while (true) {
    // eslint-disable-next-line no-await-in-loop -- ReadableStream chunks must be consumed sequentially.
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.replace(/^event:\s*/, "");
        } else if (line.startsWith("data:")) {
          const data = line.replace(/^data:\s*/, "");
          if (data === "[DONE]") return;
          if (currentEvent === "error") {
            throw new AIChatRequestError(formatAIChatError(data), formatAIChatErrorDetails(data));
          }
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (currentEvent === "message.delta") {
              if (typeof parsed.content === "string") {
                yield parsed.content;
              }
            }
            // message.completed: finished, no more data
            // heartbeat: ignore
          } catch (e) {
            if (e instanceof SyntaxError) {
              yield data;
            } else {
              throw e;
            }
          }
        }
      }
    }
  }
}
