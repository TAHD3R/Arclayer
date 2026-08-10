import type {
  BuilderChangeSetApplyOut,
  BuilderChangeSetApplyRequest,
  BuilderChangeSetPreviewOut,
  BuilderChangeSetPreviewRequest,
  BuilderCompositionSagaCancelRequest,
  BuilderCompositionSagaCreateRequest,
  BuilderCompositionSagaOut,
  BuilderCompositionSagaPhaseTransitionRequest,
  BuilderCompositionSagaRecoveryOut,
  BuilderComponentCatalogOut,
  BuilderGenerationCancelRequest,
  BuilderGenerationCreateRequest,
  BuilderGenerationOut,
  BuilderGenerationRecoveryOut,
  BuilderGenerationTargetV1,
  BuilderPageRenderDocumentOut,
  BuilderRevisionHistoryOut,
  BuilderRevisionOut,
  ProjectBuilderProjectionOut,
} from "@arclayer/openapi";

import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";

export const PROJECT_BUILDER_QUERY_KEY = ["project", "builder"] as const;

export interface BuilderDraftCheckpoint {
  id: string;
  projectId: string;
  clientSessionId: string;
  baseRevisionId: string;
  baseEtag: string;
  checkpointVersion: number;
  operations: BuilderChangeSetPreviewRequest["operations"];
  operationsHash: string;
  status: "draft" | "conflict" | "applied" | "discarded";
  provenanceSource: "human" | "agent";
  conflictMeta?: Record<string, unknown> | null;
  appliedChangeSetId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function buildProjectBuilderQueryKey(projectId: string | null) {
  return [...PROJECT_BUILDER_QUERY_KEY, projectId] as const;
}

export function buildProjectBuilderRevisionQueryKey(
  projectId: string | null,
  revisionId: string | null,
) {
  return [...PROJECT_BUILDER_QUERY_KEY, projectId, "revision", revisionId] as const;
}

export function buildProjectBuilderHistoryQueryKey(projectId: string | null) {
  return [...PROJECT_BUILDER_QUERY_KEY, projectId, "history"] as const;
}

export function buildProjectBuilderPageRenderDocumentQueryKey(
  projectId: string | null,
  revisionId: string | null,
  pageItemId: string | null,
  locale: string | null,
  theme: string | null,
) {
  return [
    ...PROJECT_BUILDER_QUERY_KEY,
    projectId,
    "revision",
    revisionId,
    "page",
    pageItemId,
    "render-document",
    locale,
    theme,
  ] as const;
}

function generationPath(projectId: string, generationId?: string): string {
  const suffix = generationId ? `/generations/${encodeURIComponent(generationId)}` : "/generations";
  return projectPath(projectId, `/builder${suffix}`);
}

function compositionSagaPath(projectId: string, sagaId?: string): string {
  const suffix = sagaId ? `/${encodeURIComponent(sagaId)}` : "";
  return projectPath(projectId, `/builder/composition-sagas${suffix}`);
}

function idempotencyOptions(idempotencyKey: string) {
  return { headers: { "Idempotency-Key": idempotencyKey } };
}

export function getProjectBuilder(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectBuilderProjectionOut> {
  return api.get<ProjectBuilderProjectionOut>(projectPath(projectId, "/builder"), { signal });
}

export function getProjectBuilderRevision(
  projectId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<BuilderRevisionOut> {
  return api.get<BuilderRevisionOut>(
    projectPath(projectId, `/builder/revisions/${encodeURIComponent(revisionId)}`),
    { signal },
  );
}

export function getProjectBuilderHistory(
  projectId: string,
  signal?: AbortSignal,
): Promise<BuilderRevisionHistoryOut> {
  return api.get<BuilderRevisionHistoryOut>(projectPath(projectId, "/builder/history"), { signal });
}

export function getProjectBuilderDraftCheckpoint(
  projectId: string,
  clientSessionId = "project-editor",
  signal?: AbortSignal,
): Promise<BuilderDraftCheckpoint | null> {
  const query = new URLSearchParams({ client_session_id: clientSessionId });
  return api.get<BuilderDraftCheckpoint | null>(
    `${projectPath(projectId, "/builder/draft-checkpoint")}?${query.toString()}`,
    { signal },
  );
}

export function saveProjectBuilderDraftCheckpoint(
  projectId: string,
  payload: Readonly<{
    baseRevisionId: string;
    baseEtag: string;
    expectedCheckpointVersion: number;
    clientSessionId: string;
    operations: BuilderChangeSetPreviewRequest["operations"];
    provenanceSource: "human";
  }>,
  idempotencyKey: string,
): Promise<BuilderDraftCheckpoint> {
  return api.put<BuilderDraftCheckpoint>(
    projectPath(projectId, "/builder/draft-checkpoint"),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function discardProjectBuilderDraftCheckpoint(
  projectId: string,
  checkpointVersion: number,
  clientSessionId = "project-editor",
): Promise<BuilderDraftCheckpoint | null> {
  const query = new URLSearchParams({
    client_session_id: clientSessionId,
    expected_checkpoint_version: String(checkpointVersion),
  });
  return api.delete<BuilderDraftCheckpoint | null>(
    `${projectPath(projectId, "/builder/draft-checkpoint")}?${query.toString()}`,
  );
}

export function getProjectBuilderPageRenderDocument(
  projectId: string,
  revisionId: string,
  pageItemId: string,
  locale: string,
  theme?: string | null,
  signal?: AbortSignal,
): Promise<BuilderPageRenderDocumentOut> {
  const query = new URLSearchParams({ locale });
  if (theme) query.set("theme", theme);
  return api.get<BuilderPageRenderDocumentOut>(
    projectPath(
      projectId,
      `/builder/revisions/${encodeURIComponent(revisionId)}/pages/${encodeURIComponent(pageItemId)}/render-document?${query.toString()}`,
    ),
    { signal },
  );
}

export function getProjectBuilderComponentCatalog(
  projectId: string,
  signal?: AbortSignal,
): Promise<BuilderComponentCatalogOut> {
  return api.get<BuilderComponentCatalogOut>(projectPath(projectId, "/builder/component-catalog"), {
    signal,
  });
}

export function createProjectBuilderGeneration(
  projectId: string,
  payload: BuilderGenerationCreateRequest,
  idempotencyKey: string,
): Promise<BuilderGenerationOut> {
  return api.post<BuilderGenerationOut>(
    generationPath(projectId),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function createProjectBuilderCompositionSaga(
  projectId: string,
  payload: BuilderCompositionSagaCreateRequest,
  idempotencyKey: string,
): Promise<BuilderCompositionSagaOut> {
  return api.post<BuilderCompositionSagaOut>(
    compositionSagaPath(projectId),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function recoverProjectBuilderCompositionSaga(
  projectId: string,
  input: Readonly<{ targets: readonly BuilderGenerationTargetV1[] }>,
  signal?: AbortSignal,
): Promise<BuilderCompositionSagaRecoveryOut> {
  const query = new URLSearchParams();
  for (const target of input.targets) {
    query.append("target", `${target.kind}:${target.itemId}`);
  }
  return api.get<BuilderCompositionSagaRecoveryOut>(
    `${compositionSagaPath(projectId)}/recovery?${query.toString()}`,
    { signal },
  );
}

export function getProjectBuilderCompositionSaga(
  projectId: string,
  sagaId: string,
  signal?: AbortSignal,
): Promise<BuilderCompositionSagaOut> {
  return api.get<BuilderCompositionSagaOut>(compositionSagaPath(projectId, sagaId), { signal });
}

export function transitionProjectBuilderCompositionSagaPhase(
  projectId: string,
  sagaId: string,
  payload: BuilderCompositionSagaPhaseTransitionRequest,
): Promise<BuilderCompositionSagaOut> {
  return api.post<BuilderCompositionSagaOut>(
    `${compositionSagaPath(projectId, sagaId)}/phase-transitions`,
    payload,
  );
}

export function cancelProjectBuilderCompositionSaga(
  projectId: string,
  sagaId: string,
  payload: BuilderCompositionSagaCancelRequest,
): Promise<BuilderCompositionSagaOut> {
  return api.post<BuilderCompositionSagaOut>(
    `${compositionSagaPath(projectId, sagaId)}/cancel`,
    payload,
  );
}

export function previewProjectBuilderChangeSet(
  projectId: string,
  payload: BuilderChangeSetPreviewRequest,
  idempotencyKey: string,
): Promise<BuilderChangeSetPreviewOut> {
  return api.post<BuilderChangeSetPreviewOut>(
    projectPath(projectId, "/builder/change-sets/preview"),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function getProjectBuilderGeneration(
  projectId: string,
  generationId: string,
  signal?: AbortSignal,
): Promise<BuilderGenerationOut> {
  return api.get<BuilderGenerationOut>(generationPath(projectId, generationId), { signal });
}

export function recoverProjectBuilderGeneration(
  projectId: string,
  input: Readonly<{
    targetStage: "wireframe" | "design";
    targets: readonly BuilderGenerationTargetV1[];
  }>,
  signal?: AbortSignal,
): Promise<BuilderGenerationRecoveryOut> {
  const query = new URLSearchParams({
    target_stage: input.targetStage,
  });
  for (const target of input.targets) {
    query.append("target", `${target.kind}:${target.itemId}`);
  }
  return api.get<BuilderGenerationRecoveryOut>(
    `${generationPath(projectId)}/recovery?${query.toString()}`,
    { signal },
  );
}

export function cancelProjectBuilderGeneration(
  projectId: string,
  generationId: string,
  payload: BuilderGenerationCancelRequest,
): Promise<BuilderGenerationOut> {
  return api.post<BuilderGenerationOut>(
    `${generationPath(projectId, generationId)}/cancel`,
    payload,
  );
}

export function applyProjectBuilderChangeSet(
  projectId: string,
  changeSetId: string,
  payload: BuilderChangeSetApplyRequest,
  idempotencyKey: string,
): Promise<BuilderChangeSetApplyOut> {
  return api.post<BuilderChangeSetApplyOut>(
    projectPath(projectId, `/builder/change-sets/${encodeURIComponent(changeSetId)}/apply`),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}
