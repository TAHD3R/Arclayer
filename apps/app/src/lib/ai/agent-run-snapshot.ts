import { findToolPart, readMessage, updatePart } from "./agent-message-reducer";
import { readObject, readPublicError, readString, readUsage } from "./agent-run-reducer-validation";
import type {
  AgentRunProjectionV1,
  AgentRunSnapshotV1,
  AgentRunStatusV1,
} from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";

const TERMINAL_TYPES_BY_STATUS = {
  completed: "run.completed",
  cancelled: "run.cancelled",
  failed: "run.failed",
} as const;
const RUN_STATUSES = [
  "created",
  "queued",
  "running",
  "cancellation_requested",
  "interrupted",
  "completed",
  "cancelled",
  "failed",
] as const satisfies readonly Exclude<AgentRunStatusV1, "idle">[];

interface SnapshotInterrupt {
  readonly interruptId: string;
  readonly checkpointId: string;
  readonly reason: "approval_required" | "human_tool_input";
  readonly approvalId: string | null;
  readonly toolCallId: string;
}

function readSnapshotRunState(
  snapshot: AgentRunSnapshotV1,
  current: AgentRunProjectionV1,
): Pick<AgentRunProjectionV1, "runStatus" | "terminalType"> {
  if (typeof snapshot.terminal !== "boolean") {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  if (snapshot.run === undefined) {
    if (snapshot.terminal) throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
    return { runStatus: current.runStatus, terminalType: null };
  }
  const status = readString(snapshot.run.status, "AGENT_SNAPSHOT_INVALID");
  if (!RUN_STATUSES.includes(status as Exclude<AgentRunStatusV1, "idle">)) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  const terminalType = TERMINAL_TYPES_BY_STATUS[status as keyof typeof TERMINAL_TYPES_BY_STATUS];
  if (snapshot.terminal !== (terminalType !== undefined)) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  return {
    runStatus: status as AgentRunStatusV1,
    terminalType: terminalType ?? null,
  };
}

function readSnapshotUsage(
  value: Readonly<Record<string, unknown>> | null | undefined,
): Readonly<Record<string, unknown>> | null {
  if (value === null || value === undefined) return null;
  if (value.settlement !== "provisional" && value.settlement !== "committed") {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  return readUsage(value, value.settlement, "AGENT_SNAPSHOT_INVALID");
}

function readPendingInterruptRequirement(
  snapshot: AgentRunSnapshotV1,
): AgentRunProjectionV1["pendingInterruptRequirement"] {
  const approvals = snapshot.pendingApprovals ?? [];
  if (approvals.length === 0) return null;
  if (approvals.length !== 1) throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  const approval = readObject(approvals[0], "AGENT_SNAPSHOT_INVALID");
  if (approval.status !== "pending") {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  return {
    approvalId: readString(approval.approvalId, "AGENT_SNAPSHOT_INVALID"),
    toolCallId: readString(approval.toolCallId, "AGENT_SNAPSHOT_INVALID"),
    checkpointId: readString(approval.checkpointId, "AGENT_SNAPSHOT_INVALID"),
  };
}

function readSnapshotInterrupt(
  snapshot: AgentRunSnapshotV1,
  runStatus: AgentRunStatusV1,
): SnapshotInterrupt | null {
  if (snapshot.run === undefined) return null;
  const value = snapshot.run.interrupt;
  if (runStatus !== "interrupted") {
    if (value !== undefined && value !== null) {
      throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
    }
    return null;
  }
  const interrupt = readObject(value, "AGENT_SNAPSHOT_INVALID");
  const reason = readString(interrupt.reason, "AGENT_SNAPSHOT_INVALID");
  if (reason !== "approval_required" && reason !== "human_tool_input") {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  const approvalId = interrupt.approvalId;
  if (reason === "approval_required" && typeof approvalId !== "string") {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  if (reason === "human_tool_input" && approvalId !== null && approvalId !== undefined) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  return {
    interruptId: readString(interrupt.interruptId, "AGENT_SNAPSHOT_INVALID"),
    checkpointId: readString(interrupt.checkpointId, "AGENT_SNAPSHOT_INVALID"),
    reason,
    approvalId: typeof approvalId === "string" ? approvalId : null,
    toolCallId: readString(interrupt.toolCallId, "AGENT_SNAPSHOT_INVALID"),
  };
}

function overlayHumanInterrupt(
  current: AgentRunProjectionV1,
  messages: AgentRunProjectionV1["messages"],
  interrupt: SnapshotInterrupt | null,
): AgentRunProjectionV1["messages"] {
  if (interrupt?.reason !== "human_tool_input") return messages;
  const state = { ...current, messages };
  const { messageId, part } = findToolPart(state, interrupt.toolCallId);
  if (
    (part.status !== "running" && part.status !== "requires_action") ||
    part.approval !== undefined
  ) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  return updatePart(state, messageId, part.partId, (currentPart) => ({
    ...currentPart,
    status: "requires_action",
    interrupt: {
      type: "human",
      payload: {
        interruptId: interrupt.interruptId,
        checkpointId: interrupt.checkpointId,
        toolCallId: interrupt.toolCallId,
      },
    },
  }));
}

function reconcilePendingInterrupt(
  pending: AgentRunProjectionV1["pendingInterruptRequirement"],
  runStatus: AgentRunStatusV1,
  interrupt: SnapshotInterrupt | null,
): AgentRunProjectionV1["pendingInterruptRequirement"] {
  if (runStatus !== "interrupted") return pending;
  if (interrupt?.reason === "human_tool_input") {
    if (pending !== null) throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
    return null;
  }
  if (
    interrupt?.reason !== "approval_required" ||
    pending === null ||
    pending.approvalId !== interrupt.approvalId ||
    pending.toolCallId !== interrupt.toolCallId ||
    pending.checkpointId !== interrupt.checkpointId
  ) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  return null;
}

function readSnapshotChangeSets(snapshot: AgentRunSnapshotV1): AgentRunProjectionV1["changeSets"] {
  const entries = (snapshot.changeSets ?? []).map((value) => {
    const changeSet = readObject(value, "AGENT_SNAPSHOT_INVALID");
    return [readString(changeSet.changeSetId, "AGENT_SNAPSHOT_INVALID"), changeSet] as const;
  });
  if (new Set(entries.map(([changeSetId]) => changeSetId)).size !== entries.length) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  return Object.fromEntries(entries);
}

export function replaceAgentRunProjectionFromExpiredCursor(
  current: AgentRunProjectionV1,
  response: { readonly error: string; readonly snapshot: AgentRunSnapshotV1 },
): AgentRunProjectionV1 {
  if (response.error !== "EVENT_CURSOR_EXPIRED") {
    throw new AgentRuntimeProtocolError("AGENT_CURSOR_RECOVERY_INVALID");
  }
  return replaceAgentRunProjectionFromSnapshot(current, response.snapshot);
}

export function replaceAgentThreadMessages(
  current: AgentRunProjectionV1,
  values: readonly Readonly<Record<string, unknown>>[],
): AgentRunProjectionV1 {
  const entries = values.map((value) => {
    const message = readMessage(value, "AGENT_SNAPSHOT_INVALID");
    return [message.messageId, message] as const;
  });
  if (new Set(entries.map(([messageId]) => messageId)).size !== entries.length) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  const messages = Object.fromEntries(entries);
  const ordered = Object.values(messages);
  return {
    ...current,
    messages,
    topLevelMessageIds: ordered
      .filter((message) => message.placement.kind === "thread")
      .map((message) => message.messageId),
    nestedMessageIds: ordered
      .filter((message) => message.placement.kind === "delegation")
      .map((message) => message.messageId),
  };
}

export function replaceAgentRunProjectionFromSnapshot(
  current: AgentRunProjectionV1,
  snapshot: AgentRunSnapshotV1,
): AgentRunProjectionV1 {
  if (
    snapshot.snapshotVersion !== 1 ||
    snapshot.runId !== current.runId ||
    snapshot.threadId !== current.threadId
  ) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_OWNER_MISMATCH");
  }
  if (!Number.isInteger(snapshot.lastSequence) || snapshot.lastSequence < 1) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  readString(snapshot.lastCursor, "AGENT_SNAPSHOT_INVALID");
  const messageEntries = snapshot.messages.map((message) => {
    const projected = readMessage(message, "AGENT_SNAPSHOT_INVALID");
    return [projected.messageId, projected] as const;
  });
  if (new Set(messageEntries.map(([messageId]) => messageId)).size !== messageEntries.length) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  const baseMessages = Object.fromEntries(messageEntries);
  const runState = readSnapshotRunState(snapshot, current);
  const interrupt = readSnapshotInterrupt(snapshot, runState.runStatus);
  const messages = overlayHumanInterrupt(current, baseMessages, interrupt);
  const orderedMessages = Object.values(messages);
  const delegationEntries = (snapshot.delegations ?? []).map(
    (delegation) =>
      [readString(delegation.delegationId, "AGENT_SNAPSHOT_INVALID"), delegation] as const,
  );
  if (
    new Set(delegationEntries.map(([delegationId]) => delegationId)).size !==
    delegationEntries.length
  ) {
    throw new AgentRuntimeProtocolError("AGENT_SNAPSHOT_INVALID");
  }
  if (snapshot.error !== undefined && snapshot.error !== null) {
    readPublicError(snapshot.error, "AGENT_SNAPSHOT_INVALID");
  }
  return {
    ...current,
    lastSequence: snapshot.lastSequence,
    lastCursor: snapshot.lastCursor,
    messages,
    topLevelMessageIds: orderedMessages
      .filter((message) => message.placement.kind === "thread")
      .map((message) => message.messageId),
    nestedMessageIds: orderedMessages
      .filter((message) => message.placement.kind === "delegation")
      .map((message) => message.messageId),
    appliedSignatures: {},
    eventSequencesById: {},
    ...runState,
    run:
      snapshot.run === undefined
        ? current.run
        : { ...snapshot.run, ...(interrupt === null ? {} : interrupt) },
    delegations: Object.fromEntries(delegationEntries),
    usage: readSnapshotUsage(snapshot.usage),
    changeSets: readSnapshotChangeSets(snapshot),
    pendingInterruptRequirement: reconcilePendingInterrupt(
      readPendingInterruptRequirement(snapshot),
      runState.runStatus,
      interrupt,
    ),
  };
}
