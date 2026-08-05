import type { AgentRunEventV1, AgentRunProjectionV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";
import {
  assertRunStatus,
  readObject,
  readString,
  readStringArray,
  readUsage,
} from "./agent-run-reducer-validation";

export function applyRunOutput(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): Partial<AgentRunProjectionV1> | null {
  const invalid = "AGENT_EVENT_PAYLOAD_INVALID";
  if (event.type === "usage.updated") {
    assertRunStatus(state, ["running", "cancellation_requested"]);
    const usage = readUsage(event.data.usage, "provisional", invalid);
    readString(event.data.providerOccurredAt, invalid);
    return { usage };
  }
  if (event.type === "changeset.proposed") {
    assertRunStatus(state, ["running"]);
    const changeSetId = readString(event.data.changeSetId, invalid);
    readString(event.data.baseRevisionId, invalid);
    readString(event.data.previewRef, invalid);
    readString(event.data.summaryKey, invalid);
    readObject(event.data.summaryParams, invalid);
    if (!Array.isArray(event.data.warnings)) throw new AgentRuntimeProtocolError(invalid);
    event.data.warnings.forEach((warning) => readObject(warning, invalid));
    readStringArray(event.data.requiredApprovalIds, invalid);
    return {
      changeSets: {
        ...state.changeSets,
        [changeSetId]: { ...event.data, status: "proposed" },
      },
    };
  }
  return null;
}
