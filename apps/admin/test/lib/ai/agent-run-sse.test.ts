import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({ apiBaseUrl: "https://api.example.test", apiPrefix: "/api/v1" }),
}));
vi.mock("@/lib/http/request-context", () => ({
  getLocaleHeaders: () => ({ "accept-language": "zh-CN", "x-locale": "zh-CN" }),
  getRequestCredentials: () => "include",
}));
vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: { getState: () => ({ accessToken: "access-token" }) },
}));

import { AgentRunCursorExpiredError, streamAgentRunEvents } from "@/lib/ai/agent-run-sse";

describe("Agent Run v1 SSE client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams fixed-name domain events after keepalives with an opaque cursor", async () => {
    const body = [
      ": keepalive\n\n",
      "id: cursor-1\n",
      "event: agent.run.event\n",
      'data: {"eventVersion":1,"eventId":"event-1","cursor":"cursor-1","type":"run.created","runId":"run/1","threadId":"thread-1","sequence":1,"occurredAt":"2026-07-18T12:00:00.000Z","correlationId":"correlation-1","spanId":null,"parentSpanId":null,"data":{"run":{"status":"created","executionMode":"build","leadAgentId":"agent-lead","createdAt":"2026-07-18T12:00:00.000Z"}}}\n\n',
      "id: cursor-2\n",
      "event: agent.run.event\n",
      'data: {"eventVersion":1,"eventId":"event-2","cursor":"cursor-2","type":"run.queued","runId":"run/1","threadId":"thread-1","sequence":2,"occurredAt":"2026-07-18T12:00:01.000Z","correlationId":"correlation-1","spanId":null,"parentSpanId":null,"data":{"queuedAt":"2026-07-18T12:00:01.000Z"}}\n\n',
    ].join("");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const events = [];
    for await (const event of streamAgentRunEvents("workspace 1", "run/1", {
      cursor: "cursor before 1",
    })) {
      events.push(event);
    }

    expect(events.map((event) => [event.sequence, event.type, event.cursor])).toEqual([
      [1, "run.created", "cursor-1"],
      [2, "run.queued", "cursor-2"],
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/workspaces/workspace%201/ai/runs/run%2F1/events?cursor=cursor+before+1",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          Authorization: "Bearer access-token",
          "accept-language": "zh-CN",
          "x-locale": "zh-CN",
        }),
      }),
    );
  });

  it("surfaces an authorized 410 snapshot and rejects conflicting cursor sources locally", async () => {
    const snapshot = {
      snapshotVersion: 1,
      runId: "run-1",
      threadId: "thread-1",
      messages: [],
      terminal: false,
      lastSequence: 7,
      lastCursor: "cursor-7",
      run: { status: "running" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "EVENT_CURSOR_EXPIRED", meta: { snapshot } }), {
        status: 410,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const consumeExpired = async () => {
      for await (const _event of streamAgentRunEvents("workspace-1", "run-1")) {
        // A 410 response has no domain events.
      }
    };
    const expiredError = await consumeExpired().catch((error: unknown) => error);
    expect(expiredError).toBeInstanceOf(AgentRunCursorExpiredError);
    expect(expiredError).toMatchObject({
      code: "EVENT_CURSOR_EXPIRED",
      snapshot,
    });

    const consumeConflict = async () => {
      for await (const _event of streamAgentRunEvents("workspace-1", "run-1", {
        cursor: "cursor-a",
        lastEventId: "cursor-b",
      })) {
        // Cursor validation occurs before a request or event.
      }
    };
    await expect(consumeConflict()).rejects.toMatchObject({
      code: "AGENT_RUN_CURSOR_CONFLICT",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
