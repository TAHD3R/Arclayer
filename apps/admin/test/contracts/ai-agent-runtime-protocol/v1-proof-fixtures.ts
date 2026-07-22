import type { ToolApprovalResponse } from "@assistant-ui/react";

export type ProofEventType =
  | "run.created"
  | "run.started"
  | "message.part.started"
  | "message.part.delta"
  | "message.part.completed"
  | "tool.started"
  | "approval.required"
  | "run.interrupted"
  | "delegation.delegated"
  | "delegation.completed"
  | "usage.updated"
  | "run.completed"
  | "run.failed";

export interface ProofEventV1 {
  readonly eventVersion: number;
  readonly eventId: string;
  readonly cursor: string;
  readonly type: ProofEventType;
  readonly runId: string;
  readonly threadId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly spanId: string | null;
  readonly parentSpanId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface OwnerScopeFixture {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly threadId: string;
  readonly runId: string;
  readonly hasPermission: boolean;
  readonly cursorExpired: boolean;
}

export interface SnapshotFixtureV1 {
  readonly snapshotVersion: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly messages: readonly Readonly<Record<string, unknown>>[];
  readonly terminal: boolean;
  readonly lastSequence: number;
  readonly lastCursor: string;
}

export type ToolResponseFixture = Readonly<{
  responseId: string;
  toolCallId: string;
  checkpointId: string;
  idempotencyKey: string;
}> &
  (
    | { readonly kind: "approval"; readonly approvalVersion: number; readonly approved: true }
    | { readonly kind: "rejection"; readonly approvalVersion: number; readonly approved: false }
    | { readonly kind: "modified_input"; readonly input: Readonly<Record<string, unknown>> }
    | { readonly kind: "human_result"; readonly result: Readonly<Record<string, unknown>> }
  );

const RUN_ID = "run-proof-1";
const THREAD_ID = "thread-proof-1";
const OCCURRED_AT = "2026-07-15T08:30:12.345Z";

export const OWNER_SCOPE = {
  actorId: "user-owner",
  workspaceId: "workspace-owner",
  projectId: "project-owner",
  threadId: THREAD_ID,
  runId: RUN_ID,
  hasPermission: true,
  cursorExpired: false,
} as const satisfies OwnerScopeFixture;

export const OWNER_VALIDATION_CASES = [
  { name: "owner", request: OWNER_SCOPE, status: 200 },
  { name: "cross-user", request: { ...OWNER_SCOPE, actorId: "user-foreign" }, status: 404 },
  {
    name: "cross-workspace",
    request: { ...OWNER_SCOPE, workspaceId: "workspace-foreign" },
    status: 404,
  },
  {
    name: "cross-project",
    request: { ...OWNER_SCOPE, projectId: "project-foreign" },
    status: 404,
  },
  {
    name: "cross-thread",
    request: { ...OWNER_SCOPE, threadId: "thread-foreign" },
    status: 404,
  },
  { name: "foreign-run", request: { ...OWNER_SCOPE, runId: "run-foreign" }, status: 404 },
  {
    name: "permission-denied",
    request: { ...OWNER_SCOPE, hasPermission: false },
    status: 403,
  },
] as const;

export function proofEvent(
  sequence: number,
  type: ProofEventType,
  data: Readonly<Record<string, unknown>>,
  overrides: Partial<ProofEventV1> = {},
): ProofEventV1 {
  return {
    eventVersion: 1,
    eventId: `event-${sequence}`,
    cursor: `cursor-${sequence}`,
    type,
    runId: RUN_ID,
    threadId: THREAD_ID,
    sequence,
    occurredAt: OCCURRED_AT,
    correlationId: "correlation-proof-1",
    spanId: null,
    parentSpanId: null,
    data,
    ...overrides,
  };
}

export const REPLAY_EVENTS = [
  proofEvent(1, "run.created", {
    run: {
      status: "created",
      executionMode: "build",
      leadAgentId: "agent-lead",
      createdAt: OCCURRED_AT,
    },
  }),
  proofEvent(2, "run.started", {
    startedAt: OCCURRED_AT,
    attemptNumber: 1,
    agentVersionId: "agent-version-lead",
  }),
  proofEvent(3, "message.part.started", {
    message: {
      messageId: "message-lead",
      role: "assistant",
      agentId: "agent-lead",
      createdAt: OCCURRED_AT,
      placement: { kind: "thread" },
    },
    part: { partId: "part-text", partIndex: 0, type: "text", status: "running", text: "" },
  }),
  proofEvent(4, "message.part.delta", {
    messageId: "message-lead",
    partId: "part-text",
    delta: { kind: "text.append", text: "Hello" },
  }),
] as const;

export const CURSOR_EXPIRED_SNAPSHOT = {
  snapshotVersion: 1,
  runId: RUN_ID,
  threadId: THREAD_ID,
  messages: [
    {
      messageId: "message-restored",
      role: "assistant",
      agentId: "agent-lead",
      createdAt: OCCURRED_AT,
      placement: { kind: "thread" },
      parts: [{ partId: "part-restored", type: "text", text: "Restored", status: "running" }],
    },
  ],
  terminal: false,
  lastSequence: 7,
  lastCursor: "cursor-7",
} as const satisfies SnapshotFixtureV1;

export const EVENT_AFTER_SNAPSHOT = proofEvent(8, "message.part.delta", {
  messageId: "message-restored",
  partId: "part-restored",
  delta: { kind: "text.append", text: " + resumed" },
});

export const NESTED_AGENT_EVENTS = [
  proofEvent(1, "run.created", {
    run: {
      status: "created",
      executionMode: "build",
      leadAgentId: "agent-lead",
      createdAt: OCCURRED_AT,
    },
  }),
  proofEvent(2, "run.started", {
    startedAt: OCCURRED_AT,
    attemptNumber: 1,
    agentVersionId: "agent-version-lead",
  }),
  proofEvent(3, "message.part.started", {
    message: {
      messageId: "message-lead",
      role: "assistant",
      agentId: "agent-lead",
      createdAt: OCCURRED_AT,
      placement: { kind: "thread" },
    },
    part: {
      partId: "part-delegation",
      partIndex: 0,
      type: "tool-call",
      status: "running",
      toolCallId: "tool-delegation",
      toolName: "agent.delegate",
      args: { objective: "Draft the hero copy" },
      argsText: '{"objective":"Draft the hero copy"}',
    },
  }),
  proofEvent(4, "delegation.delegated", {
    delegationId: "delegation-1",
    parentToolCallId: "tool-delegation",
    childRunId: "run-child-1",
    sourceAgentVersionId: "agent-version-lead",
    targetAgentVersionId: "agent-version-writer",
    delegatedAt: OCCURRED_AT,
    objectiveSummary: "Draft the hero copy",
  }),
  proofEvent(5, "message.part.started", {
    message: {
      messageId: "message-child",
      role: "assistant",
      agentId: "agent-writer",
      createdAt: OCCURRED_AT,
      placement: {
        kind: "delegation",
        delegationId: "delegation-1",
        parentToolCallId: "tool-delegation",
        sourceRunId: "run-child-1",
      },
    },
    part: { partId: "part-child-text", partIndex: 0, type: "text", status: "running", text: "" },
  }),
  proofEvent(6, "message.part.delta", {
    messageId: "message-child",
    partId: "part-child-text",
    delta: { kind: "text.append", text: "Build with confidence." },
  }),
  proofEvent(7, "message.part.completed", {
    messageId: "message-child",
    part: {
      partId: "part-child-text",
      partIndex: 0,
      type: "text",
      status: "complete",
      text: "Build with confidence.",
    },
  }),
  proofEvent(8, "delegation.completed", {
    delegationId: "delegation-1",
    childRunId: "run-child-1",
    completedAt: OCCURRED_AT,
    summary: "Hero copy drafted",
  }),
] as const;

const TOOL_RESPONSE_BASE = {
  toolCallId: "tool-approval-1",
  checkpointId: "checkpoint-1",
} as const;

export const TOOL_RESPONSE_VARIANTS = [
  {
    ...TOOL_RESPONSE_BASE,
    responseId: "response-approve",
    idempotencyKey: "response-key-approve",
    kind: "approval",
    approvalVersion: 3,
    approved: true,
  },
  {
    ...TOOL_RESPONSE_BASE,
    responseId: "response-reject",
    idempotencyKey: "response-key-reject",
    kind: "rejection",
    approvalVersion: 3,
    approved: false,
  },
  {
    ...TOOL_RESPONSE_BASE,
    responseId: "response-modified",
    idempotencyKey: "response-key-modified",
    kind: "modified_input",
    input: { title: "Reviewed title" },
  },
  {
    ...TOOL_RESPONSE_BASE,
    responseId: "response-human",
    idempotencyKey: "response-key-human",
    kind: "human_result",
    result: { selectedId: "option-1" },
  },
] as const satisfies readonly ToolResponseFixture[];

export const ASSISTANT_UI_APPROVAL_RESPONSES = [
  { approved: true },
  { approved: false, reason: "Not authorized" },
  { approved: true, optionId: "allow_once" },
] as const satisfies readonly ToolApprovalResponse[];

export const SUCCESS_TERMINAL_TRACE = [
  "provider.terminal-usage.received",
  "usage.finalized",
  "credits.committed",
  "message.persisted.complete",
  "run.persisted.completed",
  "event.appended.run.completed",
  "event.published.run.completed",
] as const;

export const CREDITS_FAILURE_TRACE = [
  "provider.terminal-usage.received",
  "usage.finalized",
  "credits.commit.failed",
  "credits.reconciled",
  "message.persisted.incomplete",
  "run.persisted.failed",
  "event.appended.run.failed",
  "event.published.run.failed",
] as const;
