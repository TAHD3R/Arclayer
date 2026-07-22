import type {
  AgentMessagePartV1,
  AgentMessagePlacementV1,
  AgentProjectedMessageV1,
  AgentRunProjectionV1,
} from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";
import { readObject, readPublicError, readString } from "./agent-run-reducer-validation";

const PART_TYPES = ["text", "source", "file", "image", "tool-call", "error"];
const PART_STATUSES = ["running", "requires_action", "complete", "incomplete", "failed"];

function readPlacement(value: unknown, code: string): AgentMessagePlacementV1 {
  const placement = readObject(value, code);
  if (placement.kind !== "thread" && placement.kind !== "delegation") {
    throw new AgentRuntimeProtocolError(code);
  }
  if (
    placement.kind === "delegation" &&
    [placement.delegationId, placement.parentToolCallId, placement.sourceRunId].some(
      (field) => typeof field !== "string" || field.length === 0,
    )
  ) {
    throw new AgentRuntimeProtocolError(code);
  }
  return placement as AgentMessagePlacementV1;
}

export function readPart(value: unknown, code: string): AgentMessagePartV1 {
  const part = readObject(value, code);
  readString(part.partId, code);
  if (!PART_TYPES.includes(readString(part.type, code))) {
    throw new AgentRuntimeProtocolError(code);
  }
  if (!PART_STATUSES.includes(readString(part.status, code))) {
    throw new AgentRuntimeProtocolError(code);
  }
  if (
    part.partIndex !== undefined &&
    (!Number.isInteger(part.partIndex) || (part.partIndex as number) < 0)
  ) {
    throw new AgentRuntimeProtocolError(code);
  }
  if (part.type === "text" && typeof part.text !== "string") {
    throw new AgentRuntimeProtocolError(code);
  }
  if (part.type === "tool-call") {
    readString(part.toolCallId, code);
    readString(part.toolName, code);
    readObject(part.args, code);
    readString(part.argsText, code);
  }
  if (part.type === "error") readPublicError(part.error, code);
  return part as AgentMessagePartV1;
}

export function readMessage(value: unknown, code: string): AgentProjectedMessageV1 {
  const message = readObject(value, code);
  const role = readString(message.role, code);
  if (role !== "assistant" && role !== "user") {
    throw new AgentRuntimeProtocolError(code);
  }
  const parts = message.parts;
  if (!Array.isArray(parts)) throw new AgentRuntimeProtocolError(code);
  let identity: Pick<AgentProjectedMessageV1, "agentId" | "actorUserId">;
  if (role === "assistant") {
    if (message.actorUserId !== undefined && message.actorUserId !== null) {
      throw new AgentRuntimeProtocolError(code);
    }
    identity = { agentId: readString(message.agentId, code) };
  } else {
    if (message.agentId !== undefined && message.agentId !== null) {
      throw new AgentRuntimeProtocolError(code);
    }
    identity = { actorUserId: readString(message.actorUserId, code) };
  }
  return {
    messageId: readString(message.messageId, code),
    role,
    ...identity,
    createdAt: readString(message.createdAt, code),
    placement: readPlacement(message.placement, code),
    parts: parts.map((part) => readPart(part, code)),
  };
}

export function startMessage(
  state: AgentRunProjectionV1,
  data: Readonly<Record<string, unknown>>,
): Partial<AgentRunProjectionV1> {
  const messageShell = readObject(data.message, "AGENT_EVENT_PAYLOAD_INVALID");
  const part = readPart(data.part, "AGENT_EVENT_PAYLOAD_INVALID");
  const message = readMessage({ ...messageShell, parts: [part] }, "AGENT_EVENT_PAYLOAD_INVALID");
  const existing = state.messages[message.messageId];
  if (existing !== undefined) {
    const placementMatches =
      existing.placement.kind === message.placement.kind &&
      existing.placement.delegationId === message.placement.delegationId &&
      existing.placement.parentToolCallId === message.placement.parentToolCallId &&
      existing.placement.sourceRunId === message.placement.sourceRunId;
    const partIndex = part.partIndex;
    if (
      existing.role !== message.role ||
      existing.agentId !== message.agentId ||
      existing.actorUserId !== message.actorUserId ||
      existing.createdAt !== message.createdAt ||
      !placementMatches ||
      existing.parts.some((candidate) => candidate.partId === part.partId) ||
      (partIndex !== undefined && partIndex !== existing.parts.length)
    ) {
      throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
    }
    return {
      messages: {
        ...state.messages,
        [message.messageId]: { ...existing, parts: [...existing.parts, part] },
      },
    };
  }
  const nested = message.placement.kind === "delegation";
  return {
    messages: { ...state.messages, [message.messageId]: message },
    topLevelMessageIds: nested
      ? state.topLevelMessageIds
      : [...state.topLevelMessageIds, message.messageId],
    nestedMessageIds: nested
      ? [...state.nestedMessageIds, message.messageId]
      : state.nestedMessageIds,
  };
}

export function updatePart(
  state: AgentRunProjectionV1,
  messageId: string,
  partId: string,
  update: (part: AgentMessagePartV1) => AgentMessagePartV1,
): Readonly<Record<string, AgentProjectedMessageV1>> {
  const message = state.messages[messageId];
  if (message === undefined) {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
  }
  let found = false;
  const parts = message.parts.map((part) => {
    if (part.partId !== partId) return part;
    found = true;
    return update(part);
  });
  if (!found) throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
  return { ...state.messages, [messageId]: { ...message, parts } };
}

export function findToolPart(
  state: AgentRunProjectionV1,
  toolCallId: string,
): { readonly messageId: string; readonly part: AgentMessagePartV1 } {
  const matches = Object.values(state.messages).flatMap((message) =>
    message.parts
      .filter((part) => part.toolCallId === toolCallId)
      .map((part) => ({ messageId: message.messageId, part })),
  );
  if (matches.length !== 1 || matches[0]?.part.type !== "tool-call") {
    throw new AgentRuntimeProtocolError("AGENT_EVENT_PAYLOAD_INVALID");
  }
  return matches[0];
}
