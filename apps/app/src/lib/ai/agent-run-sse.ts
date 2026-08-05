import { buildApiUrl } from "@/lib/http/api-url";
import { getLocaleHeaders, getRequestCredentials } from "@/lib/http/request-context";
import { useAuthStore } from "@/stores/use-auth-store";

import { readObject, readString } from "./agent-run-reducer-validation";
import type { AgentRunEventV1, AgentRunSnapshotV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";

export interface AgentRunEventStreamOptions {
  readonly cursor?: string;
  readonly lastEventId?: string;
  readonly signal?: AbortSignal;
}

export class AgentRunCursorExpiredError extends AgentRuntimeProtocolError {
  constructor(readonly snapshot: AgentRunSnapshotV1) {
    super("EVENT_CURSOR_EXPIRED");
    this.name = "AgentRunCursorExpiredError";
  }
}

export class AgentRunStreamHttpError extends AgentRuntimeProtocolError {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super("AGENT_RUN_STREAM_HTTP_ERROR");
    this.name = "AgentRunStreamHttpError";
  }
}

function segment(value: string): string {
  if (value.length === 0) throw new AgentRuntimeProtocolError("AGENT_REQUEST_INVALID");
  return encodeURIComponent(value);
}

function buildHeaders(lastEventId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...getLocaleHeaders(),
  };
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken) {
    headers.Authorization = accessToken.startsWith("Bearer ")
      ? accessToken
      : `Bearer ${accessToken}`;
  }
  if (lastEventId !== undefined) headers["Last-Event-ID"] = lastEventId;
  return headers;
}

function parseFieldValue(line: string, prefix: string): string {
  const value = line.slice(prefix.length);
  return value.startsWith(" ") ? value.slice(1) : value;
}

function parseSseFrame(frame: string): AgentRunEventV1 | null {
  let id: string | null = null;
  let eventName: string | null = null;
  const dataLines: string[] = [];
  let hasField = false;
  for (const line of frame.split("\n")) {
    if (line.length === 0 || line.startsWith(":")) continue;
    hasField = true;
    if (line.startsWith("id:")) id = parseFieldValue(line, "id:");
    else if (line.startsWith("event:")) eventName = parseFieldValue(line, "event:");
    else if (line.startsWith("data:")) dataLines.push(parseFieldValue(line, "data:"));
  }
  if (!hasField) return null;
  if (id === null || eventName !== "agent.run.event" || dataLines.length !== 1) {
    throw new AgentRuntimeProtocolError("AGENT_SSE_FRAME_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines[0] as string);
  } catch {
    throw new AgentRuntimeProtocolError("AGENT_SSE_FRAME_INVALID");
  }
  const event = readObject(parsed, "AGENT_SSE_FRAME_INVALID");
  if (readString(event.cursor, "AGENT_SSE_FRAME_INVALID") !== id) {
    throw new AgentRuntimeProtocolError("AGENT_SSE_CURSOR_MISMATCH");
  }
  return event as unknown as AgentRunEventV1;
}

async function readCursorExpired(response: Response): Promise<never> {
  const payload = readObject(await response.json(), "AGENT_CURSOR_RECOVERY_INVALID");
  if (payload.error !== "EVENT_CURSOR_EXPIRED") {
    throw new AgentRuntimeProtocolError("AGENT_CURSOR_RECOVERY_INVALID");
  }
  const meta = readObject(payload.meta, "AGENT_CURSOR_RECOVERY_INVALID");
  const snapshot = readObject(meta.snapshot, "AGENT_CURSOR_RECOVERY_INVALID");
  throw new AgentRunCursorExpiredError(snapshot as unknown as AgentRunSnapshotV1);
}

async function* readAgentRunFrames(response: Response): AsyncGenerator<AgentRunEventV1> {
  if (!response.body) throw new AgentRuntimeProtocolError("AGENT_SSE_BODY_MISSING");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop -- stream chunks are ordered by the wire.
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseSseFrame(frame);
        if (event !== null) yield event;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const event = parseSseFrame(buffer);
      if (event !== null) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamAgentRunEvents(
  workspaceId: string,
  runId: string,
  options: AgentRunEventStreamOptions = {},
): AsyncGenerator<AgentRunEventV1> {
  if (
    options.cursor !== undefined &&
    options.lastEventId !== undefined &&
    options.cursor !== options.lastEventId
  ) {
    throw new AgentRuntimeProtocolError("AGENT_RUN_CURSOR_CONFLICT");
  }
  const url = new URL(
    buildApiUrl(`/workspaces/${segment(workspaceId)}/ai/runs/${segment(runId)}/events`),
    globalThis.location?.origin ?? "http://localhost",
  );
  if (options.cursor !== undefined) url.searchParams.set("cursor", options.cursor);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(options.lastEventId),
    credentials: getRequestCredentials(),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (response.status === 410) await readCursorExpired(response);
  if (!response.ok) {
    throw new AgentRunStreamHttpError(response.status, await response.text());
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    throw new AgentRuntimeProtocolError("AGENT_SSE_CONTENT_TYPE_INVALID");
  }
  yield* readAgentRunFrames(response);
}
