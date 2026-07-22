import {
  applyAgentRunEvent,
  replaceAgentRunProjectionFromExpiredCursor,
} from "./agent-run-reducer";
import {
  AgentRunCursorExpiredError,
  type AgentRunEventStreamOptions,
  streamAgentRunEvents,
} from "./agent-run-sse";
import type { AgentRunEventV1, AgentRunProjectionV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";

export type AgentRunEventStreamFactory = (
  workspaceId: string,
  runId: string,
  options?: AgentRunEventStreamOptions,
) => AsyncGenerator<AgentRunEventV1>;

export interface ConsumeAgentRunStreamOptions {
  readonly workspaceId: string;
  readonly runId: string;
  readonly initialProjection: AgentRunProjectionV1;
  readonly signal?: AbortSignal;
  readonly stream?: AgentRunEventStreamFactory;
  readonly onProjection: (projection: AgentRunProjectionV1) => void;
}

export async function consumeAgentRunStream({
  workspaceId,
  runId,
  initialProjection,
  signal,
  stream = streamAgentRunEvents,
  onProjection,
}: ConsumeAgentRunStreamOptions): Promise<AgentRunProjectionV1> {
  let projection = initialProjection;
  let recoveredFromExpiredCursor = false;
  while (true) {
    const cursorOptions: AgentRunEventStreamOptions = recoveredFromExpiredCursor
      ? { lastEventId: projection.lastCursor as string, ...(signal ? { signal } : {}) }
      : {
          ...(projection.lastCursor ? { cursor: projection.lastCursor } : {}),
          ...(signal ? { signal } : {}),
        };
    try {
      for await (const event of stream(workspaceId, runId, cursorOptions)) {
        const next = applyAgentRunEvent(projection, event);
        if (next === projection) continue;
        projection = next;
        onProjection(projection);
      }
      return projection;
    } catch (error) {
      if (!(error instanceof AgentRunCursorExpiredError)) throw error;
      if (recoveredFromExpiredCursor) {
        throw new AgentRuntimeProtocolError("AGENT_CURSOR_RECOVERY_INVALID");
      }
      projection = replaceAgentRunProjectionFromExpiredCursor(projection, {
        error: error.code,
        snapshot: error.snapshot,
      });
      recoveredFromExpiredCursor = true;
      onProjection(projection);
    }
  }
}
