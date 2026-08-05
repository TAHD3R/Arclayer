import type { ThreadMessage, ToolCallMessagePart } from "@assistant-ui/react";

import type { ProofEventV1, SnapshotFixtureV1 } from "./v1-proof-fixtures";

interface ProjectedPart {
  readonly partId: string;
  readonly type: string;
  readonly status: string;
  readonly text?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly args?: ToolCallMessagePart["args"];
  readonly argsText?: string;
}

interface ProjectedMessage {
  readonly messageId: string;
  readonly role: "assistant" | "user";
  readonly agentId?: string;
  readonly actorUserId?: string;
  readonly createdAt: string;
  readonly placement: Readonly<Record<string, unknown>>;
  readonly parts: readonly ProjectedPart[];
}

export interface ProofProjection {
  readonly runId: string;
  readonly threadId: string;
  readonly lastSequence: number;
  readonly lastCursor: string | null;
  readonly messages: Readonly<Record<string, ProjectedMessage>>;
  readonly topLevelMessageIds: readonly string[];
  readonly nestedMessageIds: readonly string[];
  readonly applied: Readonly<Record<number, string>>;
  readonly terminalType: "run.completed" | "run.failed" | null;
  readonly composerDraft: string;
}

export class ProofContractError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function emptyProjection(runId: string, threadId: string): ProofProjection {
  return {
    runId,
    threadId,
    lastSequence: 0,
    lastCursor: null,
    messages: {},
    topLevelMessageIds: [],
    nestedMessageIds: [],
    applied: {},
    terminalType: null,
    composerDraft: "unsent local draft",
  };
}

function eventSignature(event: ProofEventV1): string {
  return JSON.stringify([event.eventId, event.cursor, event.type, event.data]);
}

function assertEnvelope(state: ProofProjection, event: ProofEventV1): "apply" | "duplicate" {
  if (event.eventVersion !== 1) throw new ProofContractError("AGENT_EVENT_VERSION_UNSUPPORTED");
  if (event.runId !== state.runId || event.threadId !== state.threadId) {
    throw new ProofContractError("AGENT_EVENT_OWNER_MISMATCH");
  }
  const appliedSignature = state.applied[event.sequence];
  if (appliedSignature !== undefined) {
    if (appliedSignature === eventSignature(event)) return "duplicate";
    throw new ProofContractError("AGENT_EVENT_SEQUENCE_INVALID");
  }
  if (event.sequence !== state.lastSequence + 1) {
    throw new ProofContractError("AGENT_EVENT_SEQUENCE_INVALID");
  }
  if (state.terminalType !== null) throw new ProofContractError("AGENT_EVENT_AFTER_TERMINAL");
  return "apply";
}

function readObject(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProofContractError(code);
  }
  return value as Readonly<Record<string, unknown>>;
}

function readString(value: unknown, code: string): string {
  if (typeof value !== "string") throw new ProofContractError(code);
  return value;
}

function readMessageIdentity(
  message: Readonly<Record<string, unknown>>,
  role: "assistant" | "user",
  code: string,
): Pick<ProjectedMessage, "agentId" | "actorUserId"> {
  if (role === "assistant") {
    if (message.actorUserId !== undefined) throw new ProofContractError(code);
    return { agentId: readString(message.agentId, code) };
  }
  if (message.agentId !== undefined) throw new ProofContractError(code);
  return { actorUserId: readString(message.actorUserId, code) };
}

function applyPartStarted(
  state: ProofProjection,
  data: Readonly<Record<string, unknown>>,
): Pick<ProofProjection, "messages" | "topLevelMessageIds" | "nestedMessageIds"> {
  const message = readObject(data.message, "AGENT_EVENT_PAYLOAD_INVALID");
  const part = readObject(data.part, "AGENT_EVENT_PAYLOAD_INVALID");
  const messageId = readString(message.messageId, "AGENT_EVENT_PAYLOAD_INVALID");
  const placement = readObject(message.placement, "AGENT_EVENT_PAYLOAD_INVALID");
  const role = readString(message.role, "AGENT_EVENT_PAYLOAD_INVALID") as "assistant" | "user";
  const projected: ProjectedMessage = {
    messageId,
    role,
    ...readMessageIdentity(message, role, "AGENT_EVENT_PAYLOAD_INVALID"),
    createdAt: readString(message.createdAt, "AGENT_EVENT_PAYLOAD_INVALID"),
    placement,
    parts: [part as unknown as ProjectedPart],
  };
  const isNested = placement.kind === "delegation";
  return {
    messages: { ...state.messages, [messageId]: projected },
    topLevelMessageIds: isNested
      ? state.topLevelMessageIds
      : [...state.topLevelMessageIds, messageId],
    nestedMessageIds: isNested ? [...state.nestedMessageIds, messageId] : state.nestedMessageIds,
  };
}

function updatePart(
  state: ProofProjection,
  messageId: string,
  partId: string,
  update: (part: ProjectedPart) => ProjectedPart,
): Readonly<Record<string, ProjectedMessage>> {
  const message = state.messages[messageId];
  if (!message) throw new ProofContractError("AGENT_EVENT_PAYLOAD_INVALID");
  let found = false;
  const parts = message.parts.map((part) => {
    if (part.partId !== partId) return part;
    found = true;
    return update(part);
  });
  if (!found) throw new ProofContractError("AGENT_EVENT_PAYLOAD_INVALID");
  return { ...state.messages, [messageId]: { ...message, parts } };
}

function applyPayload(state: ProofProjection, event: ProofEventV1): Partial<ProofProjection> {
  if (event.type === "message.part.started") return applyPartStarted(state, event.data);
  if (event.type === "message.part.delta") {
    const messageId = readString(event.data.messageId, "AGENT_EVENT_PAYLOAD_INVALID");
    const partId = readString(event.data.partId, "AGENT_EVENT_PAYLOAD_INVALID");
    const delta = readObject(event.data.delta, "AGENT_EVENT_PAYLOAD_INVALID");
    const text = readString(delta.text, "AGENT_EVENT_PAYLOAD_INVALID");
    return {
      messages: updatePart(state, messageId, partId, (part) => ({
        ...part,
        text: `${part.text ?? ""}${text}`,
      })),
    };
  }
  if (event.type === "message.part.completed") {
    const messageId = readString(event.data.messageId, "AGENT_EVENT_PAYLOAD_INVALID");
    const part = readObject(
      event.data.part,
      "AGENT_EVENT_PAYLOAD_INVALID",
    ) as unknown as ProjectedPart;
    return { messages: updatePart(state, messageId, part.partId, () => part) };
  }
  if (event.type === "run.completed") {
    const usage = readObject(event.data.usage, "AGENT_EVENT_PAYLOAD_INVALID");
    if (usage.settlement !== "committed") {
      throw new ProofContractError("AGENT_CREDITS_NOT_COMMITTED");
    }
    return { terminalType: "run.completed" };
  }
  if (event.type === "run.failed") return { terminalType: "run.failed" };
  return {};
}

export function applyProofEvent(state: ProofProjection, event: ProofEventV1): ProofProjection {
  if (assertEnvelope(state, event) === "duplicate") return state;
  return {
    ...state,
    ...applyPayload(state, event),
    lastSequence: event.sequence,
    lastCursor: event.cursor,
    applied: { ...state.applied, [event.sequence]: eventSignature(event) },
  };
}

export function reduceProofEvents(
  initial: ProofProjection,
  events: readonly ProofEventV1[],
): ProofProjection {
  return events.reduce(applyProofEvent, initial);
}

export function replaceFromExpiredCursor(
  current: ProofProjection,
  error: { readonly error: string; readonly snapshot: SnapshotFixtureV1 },
): ProofProjection {
  if (error.error !== "EVENT_CURSOR_EXPIRED") {
    throw new ProofContractError("AGENT_CURSOR_RECOVERY_INVALID");
  }
  const snapshot = error.snapshot;
  if (snapshot.runId !== current.runId || snapshot.threadId !== current.threadId) {
    throw new ProofContractError("AGENT_EVENT_OWNER_MISMATCH");
  }
  const messageEntries = snapshot.messages.map((message): readonly [string, ProjectedMessage] => {
    const messageId = readString(message.messageId, "AGENT_SNAPSHOT_INVALID");
    const role = readString(message.role, "AGENT_SNAPSHOT_INVALID");
    if (role !== "assistant" && role !== "user") {
      throw new ProofContractError("AGENT_SNAPSHOT_INVALID");
    }
    if (!Array.isArray(message.parts)) throw new ProofContractError("AGENT_SNAPSHOT_INVALID");
    return [
      messageId,
      {
        messageId,
        role,
        ...readMessageIdentity(message, role, "AGENT_SNAPSHOT_INVALID"),
        createdAt: readString(message.createdAt, "AGENT_SNAPSHOT_INVALID"),
        placement: readObject(message.placement, "AGENT_SNAPSHOT_INVALID"),
        parts: message.parts.map(
          (part) => readObject(part, "AGENT_SNAPSHOT_INVALID") as unknown as ProjectedPart,
        ),
      },
    ];
  });
  const messages: Readonly<Record<string, ProjectedMessage>> = Object.fromEntries(messageEntries);
  const topLevelMessageIds = Object.values(messages)
    .filter((message) => message.placement.kind === "thread")
    .map((message) => message.messageId);
  const nestedMessageIds = Object.values(messages)
    .filter((message) => message.placement.kind === "delegation")
    .map((message) => message.messageId);
  return {
    ...current,
    lastSequence: snapshot.lastSequence,
    lastCursor: snapshot.lastCursor,
    messages,
    topLevelMessageIds,
    nestedMessageIds,
    applied: {},
    terminalType: snapshot.terminal ? "run.completed" : null,
  };
}

function toNestedThreadMessage(message: ProjectedMessage): ThreadMessage {
  if (message.role !== "assistant" || message.agentId === undefined) {
    throw new ProofContractError("AGENT_SNAPSHOT_INVALID");
  }
  return {
    id: message.messageId,
    role: "assistant",
    createdAt: new Date(message.createdAt),
    content: message.parts.map((part) => ({ type: "text", text: part.text ?? "" })),
    status: { type: "complete", reason: "stop" },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: { agentId: message.agentId, ...message.placement },
    },
  };
}

export function projectDelegationToolPart(
  state: ProofProjection,
  toolCallId: string,
): ToolCallMessagePart {
  const parentPart = Object.values(state.messages)
    .flatMap((message) => message.parts)
    .find((part) => part.toolCallId === toolCallId);
  if (!parentPart?.toolName) throw new ProofContractError("AGENT_TOOL_PART_NOT_FOUND");
  const messages = state.nestedMessageIds
    .map((messageId) => state.messages[messageId])
    .filter(
      (message): message is ProjectedMessage => message?.placement.parentToolCallId === toolCallId,
    )
    .map(toNestedThreadMessage);
  return {
    type: "tool-call",
    toolCallId,
    toolName: parentPart.toolName,
    args: parentPart.args ?? {},
    argsText: parentPart.argsText ?? "{}",
    messages,
  };
}
