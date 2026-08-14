import type {
  DesignSystemConceptGenerationCancelRequest,
  DesignSystemConceptGenerationCreateRequest,
  DesignSystemConceptGenerationFeedbackRequest,
  DesignSystemConceptGenerationOut,
  DesignSystemConceptGenerationRecoveryOut,
  DesignSystemValidationResultOut,
  DesignSystemVersionCreateRequest,
  DesignSystemVersionDetailOut,
  ProjectDesignSystemAssignmentOut,
  ProjectDesignSystemAssignmentResultOut,
  ProjectDesignSystemAssignmentSetRequest,
  ProjectDesignSystemComparisonOut,
  ProjectDesignSystemComparisonRequest,
  ProjectDesignSystemForkOut,
  ProjectDesignSystemForkRequest,
  ProjectDesignSystemImpactPreviewOut,
  ProjectDesignSystemImpactPreviewRequest,
  ProjectDesignSystemSupersessionOut,
  ProjectDesignSystemSupersessionRequest,
  ProjectDesignSystemVersionPageOut,
} from "@arclayer/openapi";

import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";

export const PROJECT_DESIGN_SYSTEM_QUERY_KEY = ["project", "design-system"] as const;

function designSystemPath(projectId: string, suffix = ""): string {
  return projectPath(projectId, `/design-system${suffix}`);
}

function versionPath(projectId: string, systemId: string, versionId?: string): string {
  const base = `/${encodeURIComponent(systemId)}/versions`;
  return designSystemPath(projectId, versionId ? `${base}/${encodeURIComponent(versionId)}` : base);
}

function conceptGenerationPath(projectId: string, systemId: string, generationId?: string): string {
  const base = `/${encodeURIComponent(systemId)}/concept-generations`;
  return designSystemPath(
    projectId,
    generationId ? `${base}/${encodeURIComponent(generationId)}` : base,
  );
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

export function getProjectDesignSystemAssignment(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectDesignSystemAssignmentOut | null> {
  return api.get<ProjectDesignSystemAssignmentOut | null>(
    designSystemPath(projectId, "/assignment"),
    {
      signal,
    },
  );
}

export function setProjectDesignSystemAssignment(
  projectId: string,
  payload: ProjectDesignSystemAssignmentSetRequest,
  idempotencyKey: string,
): Promise<ProjectDesignSystemAssignmentResultOut> {
  return api.put<ProjectDesignSystemAssignmentResultOut>(
    designSystemPath(projectId, "/assignment"),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function forkProjectDesignSystem(
  projectId: string,
  payload: ProjectDesignSystemForkRequest,
  idempotencyKey: string,
): Promise<ProjectDesignSystemForkOut> {
  return api.post<ProjectDesignSystemForkOut>(
    designSystemPath(projectId, "/forks"),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function getProjectDesignSystemVersion(
  projectId: string,
  systemId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<DesignSystemVersionDetailOut> {
  return api.get<DesignSystemVersionDetailOut>(versionPath(projectId, systemId, versionId), {
    signal,
  });
}

export function listProjectDesignSystemVersions(
  projectId: string,
  systemId: string,
  params: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<ProjectDesignSystemVersionPageOut> {
  const { signal, ...query } = params;
  return api.get<ProjectDesignSystemVersionPageOut>(
    `${versionPath(projectId, systemId)}${queryString(query)}`,
    { signal },
  );
}

export function supersedeProjectDesignSystemVersion(
  projectId: string,
  systemId: string,
  targetVersionId: string,
  payload: ProjectDesignSystemSupersessionRequest,
  idempotencyKey: string,
): Promise<ProjectDesignSystemSupersessionOut> {
  return api.post<ProjectDesignSystemSupersessionOut>(
    `${versionPath(projectId, systemId, targetVersionId)}/supersessions`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function compareProjectDesignSystemVersions(
  projectId: string,
  systemId: string,
  payload: ProjectDesignSystemComparisonRequest,
  signal?: AbortSignal,
): Promise<ProjectDesignSystemComparisonOut> {
  return api.post<ProjectDesignSystemComparisonOut>(
    designSystemPath(projectId, `/${encodeURIComponent(systemId)}/comparisons`),
    payload,
    { signal },
  );
}

export function previewProjectDesignSystemImpact(
  projectId: string,
  systemId: string,
  payload: ProjectDesignSystemImpactPreviewRequest,
  signal?: AbortSignal,
): Promise<ProjectDesignSystemImpactPreviewOut> {
  return api.post<ProjectDesignSystemImpactPreviewOut>(
    designSystemPath(projectId, `/${encodeURIComponent(systemId)}/impact-previews`),
    payload,
    { signal },
  );
}

export function createProjectDesignSystemVersion(
  projectId: string,
  systemId: string,
  payload: DesignSystemVersionCreateRequest,
  idempotencyKey: string,
): Promise<DesignSystemVersionDetailOut> {
  return api.post<DesignSystemVersionDetailOut>(
    versionPath(projectId, systemId),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function validateProjectDesignSystemVersion(
  projectId: string,
  systemId: string,
  versionId: string,
  idempotencyKey: string,
): Promise<DesignSystemValidationResultOut> {
  return api.post<DesignSystemValidationResultOut>(
    `${versionPath(projectId, systemId, versionId)}/validations`,
    { profile: "foundation", validatorVersion: 2 },
    idempotencyOptions(idempotencyKey),
  );
}

export function createProjectDesignSystemConceptGeneration(
  projectId: string,
  systemId: string,
  payload: DesignSystemConceptGenerationCreateRequest,
  idempotencyKey: string,
): Promise<DesignSystemConceptGenerationOut> {
  return api.post<DesignSystemConceptGenerationOut>(
    conceptGenerationPath(projectId, systemId),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function getProjectDesignSystemConceptGeneration(
  projectId: string,
  systemId: string,
  generationId: string,
  signal?: AbortSignal,
): Promise<DesignSystemConceptGenerationOut> {
  return api.get<DesignSystemConceptGenerationOut>(
    conceptGenerationPath(projectId, systemId, generationId),
    { signal },
  );
}

export function recoverProjectDesignSystemConceptGenerations(
  projectId: string,
  systemId: string,
  signal?: AbortSignal,
): Promise<DesignSystemConceptGenerationRecoveryOut> {
  return api.get<DesignSystemConceptGenerationRecoveryOut>(
    `${conceptGenerationPath(projectId, systemId)}/recovery`,
    { signal },
  );
}

export function cancelProjectDesignSystemConceptGeneration(
  projectId: string,
  systemId: string,
  generationId: string,
  payload: DesignSystemConceptGenerationCancelRequest,
): Promise<DesignSystemConceptGenerationOut> {
  return api.post<DesignSystemConceptGenerationOut>(
    `${conceptGenerationPath(projectId, systemId, generationId)}/cancel`,
    payload,
  );
}

export function submitProjectDesignSystemConceptFeedback(
  projectId: string,
  systemId: string,
  generationId: string,
  payload: DesignSystemConceptGenerationFeedbackRequest,
): Promise<DesignSystemConceptGenerationOut> {
  return api.post<DesignSystemConceptGenerationOut>(
    `${conceptGenerationPath(projectId, systemId, generationId)}/feedback`,
    payload,
  );
}
