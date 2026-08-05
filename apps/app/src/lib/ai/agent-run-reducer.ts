import { applyDelegationLifecycle } from "./agent-delegation-reducer";
import { applyRunLifecycle } from "./agent-run-lifecycle-reducer";
import { readPart, startMessage, updatePart } from "./agent-message-reducer";
import { applyRunOutput } from "./agent-run-output-reducer";
import { assertRunStatus, readObject, readString } from "./agent-run-reducer-validation";
import type { AgentRunEventV1, AgentRunProjectionV1 } from "./agent-runtime-protocol";
import { AGENT_RUN_EVENT_TYPES_V1, AgentRuntimeProtocolError } from "./agent-runtime-protocol";
import { applyApprovalLifecycle, applyToolLifecycle } from "./agent-tool-reducer";

export { AgentRuntimeProtocolError } from "./agent-runtime-protocol";
export {
  replaceAgentRunProjectionFromExpiredCursor,
  replaceAgentRunProjectionFromSnapshot,
  replaceAgentThreadMessages,
} from "./agent-run-snapshot";
export type {
  AgentRunEventV1,
  AgentRunProjectionV1,
  AgentRunSnapshotV1,
} from "./agent-runtime-protocol";

interface CreateAgentRunProjectionOptions {
  readonly runId: string;
  readonly threadId: string;
  readonly composerDraft?: string;
}

export function createAgentRunProjection({
  runId,
  threadId,
  composerDraft = "",
}: CreateAgentRunProjectionOptions): AgentRunProjectionV1 {
  return {
    runId,
    threadId,
    lastSequence: 0,
    lastCursor: null,
    messages: {},
    topLevelMessageIds: [],
    nestedMessageIds: [],
    appliedSignatures: {},
    eventSequencesById: {},
    terminalType: null,
    runStatus: "idle",
    composerDraft,
    run: null,
    delegations: {},
    usage: null,
    changeSets: {},
    pendingInterruptRequirement: null,
  };
}

function eventSignature(event: AgentRunEventV1): string {
  return JSON.stringify([
    event.eventId,
    event.cursor,
    event.type,
    event.occurredAt,
    event.correlationId,
    event.spanId,
    event.parentSpanId,
    event.data,
  ]);
}

function assertEnvelope(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): "apply" | "duplicate" {
  if (event.eventVersion !== 1) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_VERSION_UNSUPPORTED");
  }
  if (!AGENT_RUN_EVENT_TYPES_V1.includes(event.type)) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_TYPE_UNSUPPORTED");
  }
  const invalid = "AGENT_EVENT_ENVELOPE_INVALID";
  readString(event.eventId, invalid);
  readString(event.cursor, invalid);
  const occurredAt = readString(event.occurredAt, invalid);
  if (!occurredAt.endsWith("Z") || Number.isNaN(Date.parse(occurredAt))) {
    throw new AgentRuntimeProtocolError(invalid);
  }
  readString(event.correlationId, invalid);
  for (const spanId of [event.spanId, event.parentSpanId]) {
    if (spanId !== null) readString(spanId, invalid);
  }
  readObject(event.data, invalid);
  if (event.runId !== state.runId || event.threadId !== state.threadId) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_OWNER_MISMATCH");
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_SEQUENCE_INVALID");
  }
  if (state.lastSequence === 0 && event.type !== "run.created") {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_TRANSITION_INVALID");
  }
  const existingSequence = state.eventSequencesById[event.eventId];
  if (existingSequence !== undefined && existingSequence !== event.sequence) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_ID_REUSED");
  }
  const appliedSignature = state.appliedSignatures[event.sequence];
  if (appliedSignature !== undefined) {
    if (appliedSignature === eventSignature(event)) return "duplicate";
    throw new AgentRuntimeProtocolError("AGENT_EVENT_SEQUENCE_INVALID");
  }
  if (event.sequence !== state.lastSequence + 1) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_SEQUENCE_INVALID");
  }
  if (state.pendingInterruptRequirement !== null && event.type !== "run.interrupted") {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_TRANSITION_INVALID");
  }
  if (state.terminalType !== null) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_AFTER_TERMINAL");
  }
  return "apply";
}

function applyPayload(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): Partial<AgentRunProjectionV1> {
  const lifecycle = applyRunLifecycle(state, event);
  if (lifecycle !== null) return lifecycle;
  if (event.type === "message.part.started") {
    assertRunStatus(state, ["running"]);
    return startMessage(state, event.data);
  }
  if (event.type === "message.part.delta") {
    assertRunStatus(state, ["running"]);
    const messageId = readString(event.data.messageId, "AGENT_EVENT_PAYLOAD_INVALID");
    const partId = readString(event.data.partId, "AGENT_EVENT_PAYLOAD_INVALID");
    const delta = readObject(event.data.delta, "AGENT_EVENT_PAYLOAD_INVALID");
    if (delta.kind !== "text.append") {
      throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
    }
    const text = readString(delta.text, "AGENT_EVENT_PAYLOAD_INVALID");
    const target = state.messages[messageId]?.parts.find((part) => part.partId === partId);
    if (target?.type !== "text" || target.status !== "running") {
      throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
    }
    return {
      messages: updatePart(state, messageId, partId, (part) => ({
        ...part,
        text: `${part.text ?? ""}${text}`,
      })),
    };
  }
  if (event.type === "message.part.completed") {
    assertRunStatus(state, ["running", "cancellation_requested"]);
    const messageId = readString(event.data.messageId, "AGENT_EVENT_PAYLOAD_INVALID");
    const part = readPart(event.data.part, "AGENT_EVENT_PAYLOAD_INVALID");
    const existing = state.messages[messageId]?.parts.find(
      (candidate) => candidate.partId === part.partId,
    );
    if (
      existing === undefined ||
      existing.type !== part.type ||
      existing.partIndex !== part.partIndex ||
      !["complete", "incomplete", "failed"].includes(part.status)
    ) {
      throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
    }
    return { messages: updatePart(state, messageId, part.partId, () => part) };
  }
  const toolLifecycle = applyToolLifecycle(state, event);
  if (toolLifecycle !== null) return toolLifecycle;
  const approvalLifecycle = applyApprovalLifecycle(state, event);
  if (approvalLifecycle !== null) return approvalLifecycle;
  const delegationLifecycle = applyDelegationLifecycle(state, event);
  if (delegationLifecycle !== null) return delegationLifecycle;
  const output = applyRunOutput(state, event);
  if (output !== null) return output;
  throw new AgentRuntimeProtocolError("AGENT_EVENT_TYPE_UNSUPPORTED");
}

export function applyAgentRunEvent(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): AgentRunProjectionV1 {
  if (assertEnvelope(state, event) === "duplicate") return state;
  return {
    ...state,
    ...applyPayload(state, event),
    lastSequence: event.sequence,
    lastCursor: event.cursor,
    appliedSignatures: {
      ...state.appliedSignatures,
      [event.sequence]: eventSignature(event),
    },
    eventSequencesById: {
      ...state.eventSequencesById,
      [event.eventId]: event.sequence,
    },
  };
}

export function reduceAgentRunEvents(
  initial: AgentRunProjectionV1,
  events: readonly AgentRunEventV1[],
): AgentRunProjectionV1 {
  return events.reduce(applyAgentRunEvent, initial);
}
