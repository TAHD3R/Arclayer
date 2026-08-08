import { findToolPart, updatePart } from "./agent-message-reducer";
import type { AgentRunEventV1, AgentRunProjectionV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";
import {
  assertRunStatus,
  readObject,
  readPositiveInteger,
  readPublicError,
  readSettlement,
  readString,
  readStringArray,
  readUsage,
} from "./agent-run-reducer-validation";

function mergeRun(
  state: AgentRunProjectionV1,
  status: AgentRunProjectionV1["runStatus"],
  data: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return { ...state.run, ...data, status };
}

function markIncompleteParts(
  state: AgentRunProjectionV1,
  partIds: readonly string[],
): AgentRunProjectionV1["messages"] {
  const incomplete = new Set(partIds);
  return Object.fromEntries(
    Object.entries(state.messages).map(([messageId, message]) => [
      messageId,
      {
        ...message,
        parts: message.parts.map((part) =>
          incomplete.has(part.partId) &&
          (part.status === "running" || part.status === "requires_action")
            ? { ...part, status: "incomplete" }
            : part,
        ),
      },
    ]),
  );
}

export function applyRunLifecycle(
  state: AgentRunProjectionV1,
  event: AgentRunEventV1,
): Partial<AgentRunProjectionV1> | null {
  const invalid = "AGENT_EVENT_PAYLOAD_INVALID";
  if (event.type === "run.created") {
    assertRunStatus(state, ["idle"]);
    const run = readObject(event.data.run, invalid);
    readString(run.status, invalid);
    readString(run.executionMode, invalid);
    readString(run.leadAgentId, invalid);
    readString(run.createdAt, invalid);
    return { runStatus: "created", run: { ...run, status: "created" } };
  }
  if (event.type === "run.queued") {
    assertRunStatus(state, ["created"]);
    readString(event.data.queuedAt, invalid);
    if (event.data.queueClass !== undefined) readString(event.data.queueClass, invalid);
    return { runStatus: "queued", run: mergeRun(state, "queued", event.data) };
  }
  if (event.type === "run.started") {
    assertRunStatus(state, ["created", "queued", "running"]);
    readString(event.data.startedAt, invalid);
    readPositiveInteger(event.data.attemptNumber, invalid);
    readString(event.data.agentVersionId, invalid);
    return { runStatus: "running", run: mergeRun(state, "running", event.data) };
  }
  if (event.type === "run.cancel.requested") {
    assertRunStatus(state, ["created", "queued", "running", "interrupted"]);
    const requestedAt = readString(event.data.requestedAt, invalid);
    readString(event.data.requestedByActorId, invalid);
    return {
      runStatus: "cancellation_requested",
      run: mergeRun(state, "cancellation_requested", {
        ...event.data,
        cancellationRequestedAt: requestedAt,
      }),
    };
  }
  if (event.type === "run.interrupted") {
    assertRunStatus(state, ["running"]);
    readString(event.data.interruptId, invalid);
    readString(event.data.checkpointId, invalid);
    const reason = readString(event.data.reason, invalid);
    if (reason !== "approval_required" && reason !== "human_tool_input") {
      throw new AgentRuntimeProtocolError(invalid);
    }
    if (event.data.approvalId != null) readString(event.data.approvalId, invalid);
    if (event.data.toolCallId != null) readString(event.data.toolCallId, invalid);
    const required = state.pendingInterruptRequirement;
    if (
      required !== null &&
      (event.data.approvalId !== required.approvalId ||
        event.data.toolCallId !== required.toolCallId ||
        event.data.checkpointId !== required.checkpointId)
    ) {
      throw new AgentRuntimeProtocolError("AGENT_EVENT_TRANSITION_INVALID");
    }
    let messages: AgentRunProjectionV1["messages"] | undefined;
    if (reason === "human_tool_input") {
      const toolCallId = readString(event.data.toolCallId, invalid);
      const { messageId, part } = findToolPart(state, toolCallId);
      if (part.status !== "running" || part.approval != null) {
        throw new AgentRuntimeProtocolError(invalid);
      }
      messages = updatePart(state, messageId, part.partId, (current) => ({
        ...current,
        status: "requires_action",
        interrupt: {
          type: "human",
          payload: {
            interruptId: event.data.interruptId,
            checkpointId: event.data.checkpointId,
            toolCallId,
          },
        },
      }));
    }
    return {
      runStatus: "interrupted",
      run: mergeRun(state, "interrupted", event.data),
      pendingInterruptRequirement: null,
      ...(messages === undefined ? {} : { messages }),
    };
  }
  if (event.type === "run.resumed") {
    assertRunStatus(state, ["interrupted"]);
    readString(event.data.interruptId, invalid);
    readString(event.data.checkpointId, invalid);
    readString(event.data.resumedAt, invalid);
    const resumeKind = readString(event.data.resumeKind, invalid);
    let messages: AgentRunProjectionV1["messages"] | undefined;
    if (resumeKind === "human_result") {
      const toolCallId = readString(state.run?.toolCallId, invalid);
      const { messageId, part } = findToolPart(state, toolCallId);
      if (part.status !== "requires_action" || part.interrupt === undefined) {
        throw new AgentRuntimeProtocolError(invalid);
      }
      messages = updatePart(state, messageId, part.partId, (current) => {
        const { interrupt: _interrupt, ...rest } = current;
        return { ...rest, status: "running" };
      });
    }
    return {
      runStatus: "running",
      run: mergeRun(state, "running", event.data),
      ...(messages === undefined ? {} : { messages }),
    };
  }
  if (event.type === "run.completed") {
    assertRunStatus(state, ["running"]);
    readString(event.data.completedAt, invalid);
    readString(event.data.assistantMessageId, invalid);
    const usage = readObject(event.data.usage, invalid);
    if (usage.settlement !== "committed") {
      throw new AgentRuntimeProtocolError("AGENT_CREDITS_NOT_COMMITTED");
    }
    readUsage(usage, "committed", invalid);
    readString(event.data.finishReason, invalid);
    return {
      runStatus: "completed",
      run: mergeRun(state, "completed", event.data),
      terminalType: "run.completed",
    };
  }
  if (event.type === "run.cancelled") {
    assertRunStatus(state, ["cancellation_requested"]);
    readString(event.data.cancelledAt, invalid);
    readString(event.data.reasonCode, invalid);
    readStringArray(event.data.incompletePartIds, invalid);
    readSettlement(event.data.settlement, invalid);
    return {
      runStatus: "cancelled",
      run: mergeRun(state, "cancelled", event.data),
      terminalType: "run.cancelled",
    };
  }
  if (event.type === "run.failed") {
    assertRunStatus(state, [
      "created",
      "queued",
      "running",
      "cancellation_requested",
      "interrupted",
    ]);
    readString(event.data.failedAt, invalid);
    readPublicError(event.data.error, invalid);
    const incompletePartIds = readStringArray(event.data.incompletePartIds, invalid);
    readSettlement(event.data.settlement, invalid);
    return {
      runStatus: "failed",
      run: mergeRun(state, "failed", event.data),
      messages: markIncompleteParts(state, incompletePartIds),
      terminalType: "run.failed",
    };
  }
  return null;
}
