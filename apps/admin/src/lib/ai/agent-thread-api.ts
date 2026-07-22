import { api } from "@/lib/http";

import type { AgentRunSnapshotV1 } from "./agent-runtime-protocol";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";

export interface AgentThreadCreateRequestV1 {
  readonly idempotencyKey: string;
  readonly projectId: string | null;
  readonly leadAgentId: string;
  readonly title: string;
}

export interface AgentThreadV1 {
  readonly protocolVersion: 1;
  readonly threadId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly leadAgentId: string;
  readonly leadAgentVersionId: string;
  readonly leadAgentAssignmentId: string;
  readonly title: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentThreadDetailV1 extends AgentThreadV1 {
  readonly activeRunId: string | null;
  readonly messages: AgentRunSnapshotV1["messages"];
}

export interface AgentThreadListV1 {
  readonly items: readonly AgentThreadV1[];
  readonly nextCursor: string | null;
}

export interface AgentThreadDeleteResultV1 {
  readonly threadId: string;
  readonly deletedAt: string;
}

export interface ListAgentThreadsOptions {
  readonly projectId?: string | null;
  readonly archived?: boolean;
  readonly query?: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
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

export async function listAgentThreads(
  workspaceId: string,
  options: ListAgentThreadsOptions = {},
): Promise<AgentThreadListV1> {
  const params = new URLSearchParams();
  if (options.projectId !== undefined && options.projectId !== null) {
    params.set("projectId", options.projectId);
  }
  if (options.archived !== undefined) params.set("archived", String(options.archived));
  if (options.query !== undefined) params.set("q", options.query);
  if (options.cursor !== undefined) params.set("cursor", options.cursor);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return api.get<AgentThreadListV1>(
    `/workspaces/${segment(workspaceId)}/ai/threads${query}`,
    requestOptions(options),
  );
}

export async function createAgentThread(
  workspaceId: string,
  request: AgentThreadCreateRequestV1,
  options?: RequestOptions,
): Promise<AgentThreadV1> {
  const { idempotencyKey, ...payload } = request;
  return api.post<AgentThreadV1>(`/workspaces/${segment(workspaceId)}/ai/threads`, payload, {
    ...requestOptions(options),
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function getAgentThread(
  workspaceId: string,
  threadId: string,
  options?: RequestOptions,
): Promise<AgentThreadDetailV1> {
  return api.get<AgentThreadDetailV1>(
    `/workspaces/${segment(workspaceId)}/ai/threads/${segment(threadId)}`,
    requestOptions(options),
  );
}

export async function updateAgentThread(
  workspaceId: string,
  threadId: string,
  request: Readonly<{ title?: string; archived?: boolean }>,
  options?: RequestOptions,
): Promise<AgentThreadV1> {
  return api.patch<AgentThreadV1>(
    `/workspaces/${segment(workspaceId)}/ai/threads/${segment(threadId)}`,
    request,
    requestOptions(options),
  );
}

export async function deleteAgentThread(
  workspaceId: string,
  threadId: string,
  options?: RequestOptions,
): Promise<AgentThreadDeleteResultV1> {
  return api.delete<AgentThreadDeleteResultV1>(
    `/workspaces/${segment(workspaceId)}/ai/threads/${segment(threadId)}`,
    requestOptions(options),
  );
}
