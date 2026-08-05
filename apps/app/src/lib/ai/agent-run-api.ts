import { api } from "@/lib/http";

import type { AgentRunSnapshotV1, AgentRunStatusV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";

export type AgentExecutionModeV1 = "plan" | "build";

export interface StartAgentRunEnvelopeV1 {
  readonly threadId: string;
  readonly leadAgentId: string;
  readonly mentionedAgentIds: readonly string[];
  readonly selectedSkillInstallationIds: readonly string[];
  readonly executionMode: AgentExecutionModeV1;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly siteRevisionId: string | null;
  readonly message: string;
  readonly idempotencyKey: string;
}

export interface CreateAgentRunResponseV1 {
  readonly protocolVersion: 1;
  readonly runId: string;
  readonly threadId: string;
  readonly status: AgentRunStatusV1;
  readonly snapshotUrl: string;
  readonly eventsUrl: string;
  readonly lastSequence: number;
  readonly lastCursor: string;
}

export interface ResumeAgentRunRequestV1 {
  readonly responseId: string;
  readonly checkpointId: string;
  readonly expectedSequence: number;
  readonly idempotencyKey: string;
}

export type AgentJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly AgentJsonValue[]
  | { readonly [key: string]: AgentJsonValue };

export type AgentToolResponseRequestV1 = Readonly<{
  checkpointId: string;
  idempotencyKey: string;
}> &
  (
    | {
        readonly kind: "approval";
        readonly approvalId: string;
        readonly approvalVersion: number;
        readonly approved: boolean;
        readonly optionId?: string;
        readonly reason?: string;
      }
    | {
        readonly kind: "human_result";
        readonly result: AgentJsonValue;
      }
  );

export interface AgentToolResponseV1 {
  readonly responseId: string;
  readonly toolCallId: string;
  readonly checkpointId: string;
  readonly responseKind: AgentToolResponseRequestV1["kind"];
  readonly expectedSequence: number;
}

export interface AgentRunCommandResponseV1 {
  readonly protocolVersion: 1;
  readonly runId: string;
  readonly status: string;
  readonly lastSequence: number;
  readonly lastCursor: string;
}

interface RequestOptions {
  readonly signal?: AbortSignal;
}

function segment(value: string): string {
  if (value.length === 0) throw new AgentRuntimeProtocolError("AGENT_REQUEST_INVALID");
  return encodeURIComponent(value);
}

function requestOptions(options?: RequestOptions): { signal: AbortSignal } | undefined {
  return options?.signal ? { signal: options.signal } : undefined;
}

export async function createAgentRun(
  envelope: StartAgentRunEnvelopeV1,
  options?: RequestOptions,
): Promise<CreateAgentRunResponseV1> {
  const { workspaceId, threadId, idempotencyKey, ...payload } = envelope;
  return api.post<CreateAgentRunResponseV1>(
    `/workspaces/${segment(workspaceId)}/ai/threads/${segment(threadId)}/runs`,
    payload,
    {
      ...requestOptions(options),
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export async function getAgentRunSnapshot(
  workspaceId: string,
  runId: string,
  options?: RequestOptions,
): Promise<AgentRunSnapshotV1> {
  return api.get<AgentRunSnapshotV1>(
    `/workspaces/${segment(workspaceId)}/ai/runs/${segment(runId)}`,
    requestOptions(options),
  );
}

export async function respondToAgentToolCall(
  workspaceId: string,
  toolCallId: string,
  request: AgentToolResponseRequestV1,
  options?: RequestOptions,
): Promise<AgentToolResponseV1> {
  const { idempotencyKey, ...payload } = request;
  return api.post<AgentToolResponseV1>(
    `/workspaces/${segment(workspaceId)}/ai/tool-calls/${segment(toolCallId)}/responses`,
    payload,
    {
      ...requestOptions(options),
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export async function resumeAgentRun(
  workspaceId: string,
  runId: string,
  request: ResumeAgentRunRequestV1,
  options?: RequestOptions,
): Promise<AgentRunCommandResponseV1> {
  return api.post<AgentRunCommandResponseV1>(
    `/workspaces/${segment(workspaceId)}/ai/runs/${segment(runId)}/resume`,
    request,
    requestOptions(options),
  );
}

export async function cancelAgentRun(
  workspaceId: string,
  runId: string,
  options?: RequestOptions,
): Promise<AgentRunSnapshotV1> {
  return api.post<AgentRunSnapshotV1>(
    `/workspaces/${segment(workspaceId)}/ai/runs/${segment(runId)}/cancel`,
    undefined,
    requestOptions(options),
  );
}
