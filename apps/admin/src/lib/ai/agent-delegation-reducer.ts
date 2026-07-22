import type { AgentRunEventV1, AgentRunProjectionV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";
import { findToolPart } from "./agent-message-reducer";
import {
  assertRunStatus,
  readObject,
  readPublicError,
  readString,
} from "./agent-run-reducer-validation";

function readArtifactRefs(value: unknown, code: string): void {
  if (!Array.isArray(value)) throw new AgentRuntimeProtocolError(code);
  value.forEach((artifact) => readObject(artifact, code));
}

function requireDelegation(
  state: AgentRunProjectionV1,
  delegationId: string,
  childRunId: string,
): Readonly<Record<string, unknown>> {
  const delegation = state.delegations[delegationId];
  if (delegation === undefined || delegation.childRunId !== childRunId) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
  }
  return delegation;
}

export function applyDelegationLifecycle(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): Partial<AgentRunProjectionV1> | null {
  const invalid = "AGENT_EVENT_PAYLOAD_INVALID";
  if (event.type === "delegation.delegated") {
    assertRunStatus(state, ["running"]);
    const delegationId = readString(event.data.delegationId, invalid);
    const parentToolCallId = readString(event.data.parentToolCallId, invalid);
    readString(event.data.childRunId, invalid);
    readString(event.data.sourceAgentVersionId, invalid);
    readString(event.data.targetAgentVersionId, invalid);
    readString(event.data.delegatedAt, invalid);
    readString(event.data.objectiveSummary, invalid);
    const { part } = findToolPart(state, parentToolCallId);
    if (part.toolName !== "agent.delegate" || state.delegations[delegationId] !== undefined) {
      throw new AgentRuntimeProtocolError(invalid);
    }
    return {
      delegations: {
        ...state.delegations,
        [delegationId]: { ...event.data, status: "delegated" },
      },
    };
  }
  if (event.type === "delegation.completed") {
    assertRunStatus(state, ["running", "cancellation_requested"]);
    const delegationId = readString(event.data.delegationId, invalid);
    const childRunId = readString(event.data.childRunId, invalid);
    const delegation = requireDelegation(state, delegationId, childRunId);
    readString(event.data.completedAt, invalid);
    readString(event.data.summary, invalid);
    if (event.data.artifactRefs !== undefined) readArtifactRefs(event.data.artifactRefs, invalid);
    return {
      delegations: {
        ...state.delegations,
        [delegationId]: { ...delegation, ...event.data, status: "completed" },
      },
    };
  }
  if (event.type === "delegation.failed") {
    assertRunStatus(state, ["running", "cancellation_requested"]);
    const delegationId = readString(event.data.delegationId, invalid);
    const childRunId = readString(event.data.childRunId, invalid);
    const delegation = requireDelegation(state, delegationId, childRunId);
    readString(event.data.failedAt, invalid);
    const error = readPublicError(event.data.error, invalid);
    return {
      delegations: {
        ...state.delegations,
        [delegationId]: { ...delegation, ...event.data, error, status: "failed" },
      },
    };
  }
  return null;
}
