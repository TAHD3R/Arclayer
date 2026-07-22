import type {
  KnowledgeBaseCreateRequest,
  KnowledgeBaseDetailOut,
  KnowledgeBaseUpdateRequest,
  KnowledgeCursorPageKnowledgeBaseSummaryOut,
  KnowledgeCursorPageKnowledgeSourceOut,
  KnowledgeCursorPageKnowledgeSourceVersionOut,
  KnowledgeSourceCreateRequest,
  KnowledgeSourceOut,
  KnowledgeSourceUpdateRequest,
  KnowledgeSourceVersionOut,
  ManualKnowledgeVersionCreateRequest,
  WorkspaceKnowledgeCapabilitiesOut,
} from "@arclayer/openapi";

import { api } from "@/lib/http";

export const WORKSPACE_KNOWLEDGE_QUERY_KEY = ["workspace", "knowledge"] as const;

function workspacePath(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/knowledge-bases`;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function idempotencyOptions(idempotencyKey: string) {
  return { headers: { "Idempotency-Key": idempotencyKey } };
}

export function getWorkspaceKnowledgeCapabilities(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceKnowledgeCapabilitiesOut> {
  return api.get<WorkspaceKnowledgeCapabilitiesOut>(`${workspacePath(workspaceId)}/capabilities`, {
    signal,
  });
}

export function listKnowledgeBases(
  workspaceId: string,
  params: { q?: string; limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<KnowledgeCursorPageKnowledgeBaseSummaryOut> {
  const { signal, ...query } = params;
  return api.get<KnowledgeCursorPageKnowledgeBaseSummaryOut>(
    `${workspacePath(workspaceId)}${queryString(query)}`,
    { signal },
  );
}

export function getKnowledgeBase(
  workspaceId: string,
  baseId: string,
  signal?: AbortSignal,
): Promise<KnowledgeBaseDetailOut> {
  return api.get<KnowledgeBaseDetailOut>(
    `${workspacePath(workspaceId)}/${encodeURIComponent(baseId)}`,
    { signal },
  );
}

export function createKnowledgeBase(
  workspaceId: string,
  payload: KnowledgeBaseCreateRequest,
  idempotencyKey: string,
): Promise<KnowledgeBaseDetailOut> {
  return api.post<KnowledgeBaseDetailOut>(
    workspacePath(workspaceId),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function updateKnowledgeBase(
  workspaceId: string,
  baseId: string,
  payload: KnowledgeBaseUpdateRequest,
): Promise<KnowledgeBaseDetailOut> {
  return api.patch<KnowledgeBaseDetailOut>(
    `${workspacePath(workspaceId)}/${encodeURIComponent(baseId)}`,
    payload,
  );
}

export function listKnowledgeSources(
  workspaceId: string,
  baseId: string,
  params: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<KnowledgeCursorPageKnowledgeSourceOut> {
  const { signal, ...query } = params;
  return api.get<KnowledgeCursorPageKnowledgeSourceOut>(
    `${workspacePath(workspaceId)}/${encodeURIComponent(baseId)}/sources${queryString(query)}`,
    { signal },
  );
}

export function createKnowledgeSource(
  workspaceId: string,
  baseId: string,
  payload: KnowledgeSourceCreateRequest,
  idempotencyKey: string,
): Promise<KnowledgeSourceOut> {
  return api.post<KnowledgeSourceOut>(
    `${workspacePath(workspaceId)}/${encodeURIComponent(baseId)}/sources`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function updateKnowledgeSource(
  workspaceId: string,
  baseId: string,
  sourceId: string,
  payload: KnowledgeSourceUpdateRequest,
): Promise<KnowledgeSourceOut> {
  return api.patch<KnowledgeSourceOut>(
    `${workspacePath(workspaceId)}/${encodeURIComponent(baseId)}/sources/${encodeURIComponent(sourceId)}`,
    payload,
  );
}

export function listKnowledgeSourceVersions(
  workspaceId: string,
  baseId: string,
  sourceId: string,
  params: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<KnowledgeCursorPageKnowledgeSourceVersionOut> {
  const { signal, ...query } = params;
  return api.get<KnowledgeCursorPageKnowledgeSourceVersionOut>(
    `${workspacePath(workspaceId)}/${encodeURIComponent(baseId)}/sources/${encodeURIComponent(sourceId)}/versions${queryString(query)}`,
    { signal },
  );
}

export function createManualKnowledgeSourceVersion(
  workspaceId: string,
  baseId: string,
  sourceId: string,
  payload: ManualKnowledgeVersionCreateRequest,
  idempotencyKey: string,
): Promise<KnowledgeSourceVersionOut> {
  return api.post<KnowledgeSourceVersionOut>(
    `${workspacePath(workspaceId)}/${encodeURIComponent(baseId)}/sources/${encodeURIComponent(sourceId)}/versions`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}
