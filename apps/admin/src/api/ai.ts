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
}

export async function chat(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): Promise<AIChatResponse> {
  return api.post<AIChatResponse>(
    "/chat",
    { messages },
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
    body: JSON.stringify({ messages }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || `Chat API error: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is empty");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  let currentEvent = "";

  while (true) {
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
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (currentEvent === "error") {
              const message =
                typeof parsed.message === "string" ? parsed.message : "Chat stream error";
              throw new Error(message);
            }
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
