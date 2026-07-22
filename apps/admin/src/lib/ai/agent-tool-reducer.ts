import type { AgentRunEventV1, AgentRunProjectionV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";
import { findToolPart, updatePart } from "./agent-message-reducer";
import {
  assertRunStatus,
  readObject,
  readPositiveInteger,
  readPublicError,
  readString,
} from "./agent-run-reducer-validation";

function readArtifactRefs(
  value: unknown,
  code: string,
): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) throw new AgentRuntimeProtocolError(code);
  return value.map((artifact) => readObject(artifact, code));
}

function readProgress(value: unknown, code: string): Readonly<Record<string, unknown>> {
  const progress = readObject(value, code);
  readString(progress.messageKey, code);
  readObject(progress.messageParams, code);
  for (const field of [progress.current, progress.total]) {
    if (
      field !== undefined &&
      (typeof field !== "number" || !Number.isFinite(field) || field < 0)
    ) {
      throw new AgentRuntimeProtocolError(code);
    }
  }
  if (progress.unit !== undefined) readString(progress.unit, code);
  return progress;
}

export function applyToolLifecycle(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): Partial<AgentRunProjectionV1> | null {
  const invalid = "AGENT_EVENT_PAYLOAD_INVALID";
  if (event.type === "tool.started") {
    assertRunStatus(state, ["running"]);
    const messageId = readString(event.data.messageId, invalid);
    const partId = readString(event.data.partId, invalid);
    const toolCallId = readString(event.data.toolCallId, invalid);
    readString(event.data.toolId, invalid);
    readString(event.data.toolVersion, invalid);
    const toolName = readString(event.data.toolName, invalid);
    readObject(event.data.args, invalid);
    readString(event.data.argsText, invalid);
    readString(event.data.startedAt, invalid);
    const part = state.messages[messageId]?.parts.find((candidate) => candidate.partId === partId);
    if (
      part?.type !== "tool-call" ||
      part.toolCallId !== toolCallId ||
      part.toolName !== toolName
    ) {
      throw new AgentRuntimeProtocolError(invalid);
    }
    return {
      messages: updatePart(state, messageId, partId, (current) => ({
        ...current,
        toolId: event.data.toolId,
        toolVersion: event.data.toolVersion,
        args: event.data.args,
        argsText: event.data.argsText,
        startedAt: event.data.startedAt,
      })),
    };
  }
  if (event.type === "tool.progress") {
    assertRunStatus(state, ["running", "cancellation_requested"]);
    const toolCallId = readString(event.data.toolCallId, invalid);
    const progress = readProgress(event.data.progress, invalid);
    const { messageId, part } = findToolPart(state, toolCallId);
    return {
      messages: updatePart(state, messageId, part.partId, (current) => ({
        ...current,
        progress,
      })),
    };
  }
  if (event.type === "tool.completed") {
    assertRunStatus(state, ["running", "cancellation_requested"]);
    const toolCallId = readString(event.data.toolCallId, invalid);
    readString(event.data.completedAt, invalid);
    if (event.data.result === undefined && event.data.resultRef === undefined) {
      throw new AgentRuntimeProtocolError(invalid);
    }
    if (event.data.resultRef !== undefined) readString(event.data.resultRef, invalid);
    if (event.data.artifactRefs !== undefined) readArtifactRefs(event.data.artifactRefs, invalid);
    const { messageId, part } = findToolPart(state, toolCallId);
    return {
      messages: updatePart(state, messageId, part.partId, (current) => ({
        ...current,
        completedAt: event.data.completedAt,
        ...(event.data.result === undefined ? {} : { result: event.data.result }),
        ...(event.data.resultRef === undefined ? {} : { resultRef: event.data.resultRef }),
        ...(event.data.artifactRefs === undefined ? {} : { artifactRefs: event.data.artifactRefs }),
      })),
    };
  }
  if (event.type === "tool.failed") {
    assertRunStatus(state, ["running", "cancellation_requested"]);
    const toolCallId = readString(event.data.toolCallId, invalid);
    readString(event.data.failedAt, invalid);
    const error = readPublicError(event.data.error, invalid);
    const { messageId, part } = findToolPart(state, toolCallId);
    return {
      messages: updatePart(state, messageId, part.partId, (current) => ({
        ...current,
        failedAt: event.data.failedAt,
        error,
      })),
    };
  }
  return null;
}

const APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled", "expired"];
const APPROVAL_OPTION_KINDS = ["allow-once", "allow-always", "reject-once", "reject-always"];

function readApproval(value: unknown, code: string): Readonly<Record<string, unknown>> {
  const approval = readObject(value, code);
  readString(approval.approvalId, code);
  readPositiveInteger(approval.approvalVersion, code);
  readString(approval.toolCallId, code);
  readString(approval.checkpointId, code);
  if (!APPROVAL_STATUSES.includes(String(approval.status))) {
    throw new AgentRuntimeProtocolError(code);
  }
  readString(approval.requestedAt, code);
  readString(approval.expiresAt, code);
  readString(approval.policyVersion, code);
  const risk = readObject(approval.risk, code);
  readString(risk.sideEffectClass, code);
  readString(risk.summaryKey, code);
  readObject(risk.summaryParams, code);
  if (risk.previewRef !== null && risk.previewRef !== undefined) readString(risk.previewRef, code);
  if (!Array.isArray(approval.options)) throw new AgentRuntimeProtocolError(code);
  for (const value of approval.options) {
    const option = readObject(value, code);
    readString(option.id, code);
    if (!APPROVAL_OPTION_KINDS.includes(String(option.kind))) {
      throw new AgentRuntimeProtocolError(code);
    }
    readString(option.labelKey, code);
    readString(option.descriptionKey, code);
    if (!Array.isArray(option.grants) || typeof option.confirm !== "boolean") {
      throw new AgentRuntimeProtocolError(code);
    }
  }
  return approval;
}

export function applyApprovalLifecycle(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): Partial<AgentRunProjectionV1> | null {
  const invalid = "AGENT_EVENT_PAYLOAD_INVALID";
  if (event.type === "approval.required") {
    assertRunStatus(state, ["running"]);
    const approval = readApproval(event.data.approval, invalid);
    if (approval.status !== "pending") throw new AgentRuntimeProtocolError(invalid);
    const messageId = readString(event.data.messageId, invalid);
    const partId = readString(event.data.partId, invalid);
    const part = state.messages[messageId]?.parts.find((candidate) => candidate.partId === partId);
    if (
      part?.type !== "tool-call" ||
      part.toolCallId !== approval.toolCallId ||
      state.pendingInterruptRequirement !== null
    ) {
      throw new AgentRuntimeProtocolError(invalid);
    }
    return {
      messages: updatePart(state, messageId, partId, (current) => ({
        ...current,
        status: "requires_action",
        approval,
      })),
      pendingInterruptRequirement: {
        approvalId: approval.approvalId as string,
        toolCallId: approval.toolCallId as string,
        checkpointId: approval.checkpointId as string,
      },
    };
  }
  if (event.type === "approval.resolved") {
    assertRunStatus(state, ["interrupted", "cancellation_requested"]);
    const approval = readApproval(event.data.approval, invalid);
    if (approval.status === "pending") throw new AgentRuntimeProtocolError(invalid);
    readString(event.data.resolvedAt, invalid);
    readString(event.data.resolvedByActorId, invalid);
    const { messageId, part } = findToolPart(state, approval.toolCallId as string);
    const existing = readObject(part.approval, invalid);
    if (
      existing.approvalId !== approval.approvalId ||
      existing.approvalVersion !== approval.approvalVersion
    ) {
      throw new AgentRuntimeProtocolError(invalid);
    }
    return {
      messages: updatePart(state, messageId, part.partId, (current) => ({
        ...current,
        status: approval.status === "approved" ? "running" : "failed",
        approval,
      })),
    };
  }
  return null;
}
