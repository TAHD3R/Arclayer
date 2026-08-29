import type {
  KnowledgeGuidanceDraftSaveRequest,
  KnowledgeGuidanceEffectivePreviewOut,
  KnowledgeGuidanceLayerOut,
  KnowledgeGuidancePreviewApplyRequest,
  KnowledgeGuidancePreviewOut,
  KnowledgeGuidancePublishRequest,
  KnowledgeGuidanceReferenceAttachRequest,
  KnowledgeGuidanceReferenceDetachRequest,
  KnowledgeGuidanceRemovePreviewRequest,
} from "@arclayer/openapi";

import { api } from "@/lib/http";

export const WORKSPACE_GUIDANCE_QUERY_KEY = ["workspace", "guidance"] as const;

export type GuidanceScope = Readonly<{
  workspaceId: string;
  projectId?: string | null;
}>;

function guidancePath(scope: GuidanceScope): string {
  const workspaceId = encodeURIComponent(scope.workspaceId);
  if (!scope.projectId) return `/workspaces/${workspaceId}/guidance`;
  return `/workspaces/${workspaceId}/guidance/projects/${encodeURIComponent(scope.projectId)}`;
}

function queryString(values: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function commandOptions(idempotencyKey: string) {
  return { headers: { "Idempotency-Key": idempotencyKey } };
}

export function getGuidanceLayer(
  scope: GuidanceScope,
  signal?: AbortSignal,
): Promise<KnowledgeGuidanceLayerOut> {
  return api.get<KnowledgeGuidanceLayerOut>(guidancePath(scope), { signal });
}

export function saveGuidanceDraft(
  scope: GuidanceScope,
  payload: KnowledgeGuidanceDraftSaveRequest,
  idempotencyKey: string,
): Promise<KnowledgeGuidanceLayerOut> {
  const path = scope.projectId ? guidancePath(scope) : `${guidancePath(scope)}/draft`;
  return api.put<KnowledgeGuidanceLayerOut>(path, payload, commandOptions(idempotencyKey));
}

export function publishGuidance(
  scope: GuidanceScope,
  payload: KnowledgeGuidancePublishRequest,
  idempotencyKey: string,
): Promise<KnowledgeGuidanceLayerOut> {
  return api.post<KnowledgeGuidanceLayerOut>(
    `${guidancePath(scope)}/publish`,
    payload,
    commandOptions(idempotencyKey),
  );
}

export function getEffectiveGuidance(
  workspaceId: string,
  projectId?: string | null,
  signal?: AbortSignal,
): Promise<KnowledgeGuidanceEffectivePreviewOut> {
  const scope: GuidanceScope = { workspaceId };
  return api.get<KnowledgeGuidanceEffectivePreviewOut>(
    `${guidancePath(scope)}/effective${queryString({ projectId })}`,
    { signal },
  );
}

export function createGuidanceRemovePreview(
  scope: GuidanceScope,
  payload: KnowledgeGuidanceRemovePreviewRequest,
  idempotencyKey: string,
): Promise<KnowledgeGuidancePreviewOut> {
  return api.post<KnowledgeGuidancePreviewOut>(
    `${guidancePath(scope)}/remove-previews`,
    payload,
    commandOptions(idempotencyKey),
  );
}

export function applyGuidanceRemovePreview(
  scope: GuidanceScope,
  previewId: string,
  payload: KnowledgeGuidancePreviewApplyRequest,
  idempotencyKey: string,
): Promise<KnowledgeGuidanceLayerOut> {
  return api.post<KnowledgeGuidanceLayerOut>(
    `${guidancePath(scope)}/remove-previews/${encodeURIComponent(previewId)}/apply`,
    payload,
    commandOptions(idempotencyKey),
  );
}

export function attachGuidanceReference(
  scope: GuidanceScope,
  payload: KnowledgeGuidanceReferenceAttachRequest,
  idempotencyKey: string,
): Promise<KnowledgeGuidanceLayerOut> {
  return api.post<KnowledgeGuidanceLayerOut>(
    `${guidancePath(scope)}/references`,
    payload,
    commandOptions(idempotencyKey),
  );
}

export function detachGuidanceReference(
  scope: GuidanceScope,
  knowledgeBaseId: string,
  payload: KnowledgeGuidanceReferenceDetachRequest,
  idempotencyKey: string,
): Promise<KnowledgeGuidanceLayerOut> {
  return api.post<KnowledgeGuidanceLayerOut>(
    `${guidancePath(scope)}/references/${encodeURIComponent(knowledgeBaseId)}/detach`,
    payload,
    commandOptions(idempotencyKey),
  );
}
