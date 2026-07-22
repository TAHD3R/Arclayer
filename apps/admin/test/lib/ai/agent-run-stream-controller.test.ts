import { describe, expect, it, vi } from "vitest";

import {
  consumeAgentRunStream,
  type AgentRunEventStreamFactory,
} from "@/lib/ai/agent-run-stream-controller";
import { createAgentRunProjection, reduceAgentRunEvents } from "@/lib/ai/agent-run-reducer";
import { AgentRunCursorExpiredError } from "@/lib/ai/agent-run-sse";
import {
  CURSOR_EXPIRED_SNAPSHOT,
  EVENT_AFTER_SNAPSHOT,
  OWNER_SCOPE,
  REPLAY_EVENTS,
} from "../../contracts/ai-agent-runtime-protocol/v1-proof-fixtures";

describe("Agent Run v1 stream controller", () => {
  it("replaces from an expired cursor and resumes reduction from the snapshot high-water mark", async () => {
    let connection = 0;
    const stream = vi.fn<AgentRunEventStreamFactory>((_workspaceId, _runId, options) => {
      connection += 1;
      return (async function* () {
        if (connection === 1) {
          throw new AgentRunCursorExpiredError(CURSOR_EXPIRED_SNAPSHOT);
        }
        expect(options).toMatchObject({ lastEventId: "cursor-7" });
        yield EVENT_AFTER_SNAPSHOT;
      })();
    });
    const onProjection = vi.fn();
    const stale = reduceAgentRunEvents(
      createAgentRunProjection({
        runId: OWNER_SCOPE.runId,
        threadId: OWNER_SCOPE.threadId,
        composerDraft: "unsent local draft",
      }),
      REPLAY_EVENTS,
    );

    const finalProjection = await consumeAgentRunStream({
      workspaceId: OWNER_SCOPE.workspaceId,
      runId: OWNER_SCOPE.runId,
      initialProjection: stale,
      stream,
      onProjection,
    });

    expect(finalProjection.lastSequence).toBe(8);
    expect(finalProjection.composerDraft).toBe("unsent local draft");
    expect(finalProjection.messages["message-restored"]?.parts[0]?.text).toBe("Restored + resumed");
    expect(stream).toHaveBeenCalledTimes(2);
    expect(onProjection).toHaveBeenCalledTimes(2);
    expect(onProjection.mock.calls[0]?.[0].lastSequence).toBe(7);
    expect(onProjection.mock.calls[1]?.[0].lastSequence).toBe(8);
  });
});
