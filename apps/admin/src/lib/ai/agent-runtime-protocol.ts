export type AgentRunEventTypeV1 =
  | "run.created"
  | "run.queued"
  | "run.started"
  | "run.cancel.requested"
  | "message.part.started"
  | "message.part.delta"
  | "message.part.completed"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "tool.failed"
  | "approval.required"
  | "approval.resolved"
  | "run.interrupted"
  | "run.resumed"
  | "delegation.delegated"
  | "delegation.completed"
  | "delegation.failed"
  | "changeset.proposed"
  | "usage.updated"
  | "run.completed"
  | "run.cancelled"
  | "run.failed";

export const AGENT_RUN_EVENT_TYPES_V1: readonly AgentRunEventTypeV1[] = [
  "run.created",
  "run.queued",
  "run.started",
  "run.cancel.requested",
  "message.part.started",
  "message.part.delta",
  "message.part.completed",
  "tool.started",
  "tool.progress",
  "tool.completed",
  "tool.failed",
  "approval.required",
  "approval.resolved",
  "run.interrupted",
  "run.resumed",
  "delegation.delegated",
  "delegation.completed",
  "delegation.failed",
  "changeset.proposed",
  "usage.updated",
  "run.completed",
  "run.cancelled",
  "run.failed",
];

export interface AgentRunEventV1 {
  readonly eventVersion: number;
  readonly eventId: string;
  readonly cursor: string;
  readonly type: AgentRunEventTypeV1;
  readonly runId: string;
  readonly threadId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly spanId: string | null;
  readonly parentSpanId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface AgentMessagePartV1 extends Readonly<Record<string, unknown>> {
  readonly partId: string;
  readonly partIndex?: number;
  readonly type: string;
  readonly status: string;
  readonly text?: string;
}

export interface AgentMessagePlacementV1 extends Readonly<Record<string, unknown>> {
  readonly kind: "thread" | "delegation";
  readonly delegationId?: string;
  readonly parentToolCallId?: string;
  readonly sourceRunId?: string;
}

export interface AgentProjectedMessageV1 {
  readonly messageId: string;
  readonly role: "assistant" | "user";
  readonly agentId?: string;
  readonly actorUserId?: string;
  readonly createdAt: string;
  readonly placement: AgentMessagePlacementV1;
  readonly parts: readonly AgentMessagePartV1[];
}

export interface AgentRunSnapshotV1 {
  readonly snapshotVersion: number;
  readonly runId: string;
  readonly threadId: string;
  readonly messages: readonly Readonly<Record<string, unknown>>[];
  readonly terminal: boolean;
  readonly lastSequence: number;
  readonly lastCursor: string;
  readonly minimumReplaySequence?: number;
  readonly minimumReplayCursor?: string | null;
  readonly thread?: Readonly<Record<string, unknown>>;
  readonly run?: Readonly<Record<string, unknown>>;
  readonly pendingApprovals?: readonly Readonly<Record<string, unknown>>[];
  readonly delegations?: readonly Readonly<Record<string, unknown>>[];
  readonly changeSets?: readonly Readonly<Record<string, unknown>>[];
  readonly artifactRefs?: readonly Readonly<Record<string, unknown>>[];
  readonly usage?: Readonly<Record<string, unknown>> | null;
  readonly error?: Readonly<Record<string, unknown>> | null;
}

export type AgentRunStatusV1 =
  | "idle"
  | "created"
  | "queued"
  | "running"
  | "cancellation_requested"
  | "interrupted"
  | "completed"
  | "cancelled"
  | "failed";

export interface AgentRunProjectionV1 {
  readonly runId: string;
  readonly threadId: string;
  readonly lastSequence: number;
  readonly lastCursor: string | null;
  readonly messages: Readonly<Record<string, AgentProjectedMessageV1>>;
  readonly topLevelMessageIds: readonly string[];
  readonly nestedMessageIds: readonly string[];
  readonly appliedSignatures: Readonly<Record<number, string>>;
  readonly eventSequencesById: Readonly<Record<string, number>>;
  readonly terminalType: "run.completed" | "run.cancelled" | "run.failed" | null;
  readonly runStatus: AgentRunStatusV1;
  readonly composerDraft: string;
  readonly run: Readonly<Record<string, unknown>> | null;
  readonly delegations: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly usage: Readonly<Record<string, unknown>> | null;
  readonly changeSets: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly pendingInterruptRequirement: Readonly<{
    approvalId: string;
    toolCallId: string;
    checkpointId: string;
  }> | null;
}

export class AgentRuntimeProtocolError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AgentRuntimeProtocolError";
  }
}
