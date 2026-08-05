import type {
  DesignSystemCreateRequest,
  DesignSystemCursorPageDesignSystemSummaryOut,
  DesignSystemCursorPageDesignSystemVersionSummaryOut,
  DesignSystemDetailOut,
  DesignSystemValidationResultOut,
  DesignSystemVersionCreateRequest,
  DesignSystemVersionDetailOut,
  ComponentCatalogV1,
  WorkspaceDesignSystemDefaultOut,
  WorkspaceDesignSystemDefaultSetRequest,
  WorkspaceDesignSystemsCapabilitiesOut,
} from "@arclayer/openapi";

import { api } from "@/lib/http";

export const WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY = ["workspace", "design-systems"] as const;

function systemsPath(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/design-systems`;
}

function systemPath(workspaceId: string, systemId: string): string {
  return `${systemsPath(workspaceId)}/${encodeURIComponent(systemId)}`;
}

function versionPath(workspaceId: string, systemId: string, versionId: string): string {
  return `${systemPath(workspaceId, systemId)}/versions/${encodeURIComponent(versionId)}`;
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

export function getWorkspaceDesignSystemsCapabilities(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceDesignSystemsCapabilitiesOut> {
  return api.get<WorkspaceDesignSystemsCapabilitiesOut>(
    `${systemsPath(workspaceId)}/capabilities`,
    {
      signal,
    },
  );
}

export function listWorkspaceDesignSystems(
  workspaceId: string,
  params: { q?: string; limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<DesignSystemCursorPageDesignSystemSummaryOut> {
  const { signal, ...query } = params;
  return api.get<DesignSystemCursorPageDesignSystemSummaryOut>(
    `${systemsPath(workspaceId)}${queryString(query)}`,
    { signal },
  );
}

export function getWorkspaceDesignSystem(
  workspaceId: string,
  systemId: string,
  signal?: AbortSignal,
): Promise<DesignSystemDetailOut> {
  return api.get<DesignSystemDetailOut>(systemPath(workspaceId, systemId), { signal });
}

export function createWorkspaceDesignSystem(
  workspaceId: string,
  payload: DesignSystemCreateRequest,
  idempotencyKey: string,
): Promise<DesignSystemDetailOut> {
  return api.post<DesignSystemDetailOut>(
    systemsPath(workspaceId),
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function listWorkspaceDesignSystemVersions(
  workspaceId: string,
  systemId: string,
  params: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<DesignSystemCursorPageDesignSystemVersionSummaryOut> {
  const { signal, ...query } = params;
  return api.get<DesignSystemCursorPageDesignSystemVersionSummaryOut>(
    `${systemPath(workspaceId, systemId)}/versions${queryString(query)}`,
    { signal },
  );
}

export function getWorkspaceDesignSystemVersion(
  workspaceId: string,
  systemId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<DesignSystemVersionDetailOut> {
  return api.get<DesignSystemVersionDetailOut>(versionPath(workspaceId, systemId, versionId), {
    signal,
  });
}

export function createWorkspaceDesignSystemVersion(
  workspaceId: string,
  systemId: string,
  payload: DesignSystemVersionCreateRequest,
  idempotencyKey: string,
): Promise<DesignSystemVersionDetailOut> {
  return api.post<DesignSystemVersionDetailOut>(
    `${systemPath(workspaceId, systemId)}/versions`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function validateWorkspaceDesignSystemVersion(
  workspaceId: string,
  systemId: string,
  versionId: string,
  idempotencyKey: string,
): Promise<DesignSystemValidationResultOut> {
  return api.post<DesignSystemValidationResultOut>(
    `${versionPath(workspaceId, systemId, versionId)}/validations`,
    { profile: "foundation", validatorVersion: 2 },
    idempotencyOptions(idempotencyKey),
  );
}

export function listWorkspaceDesignSystemValidationResults(
  workspaceId: string,
  systemId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<DesignSystemValidationResultOut[]> {
  return api.get<DesignSystemValidationResultOut[]>(
    `${versionPath(workspaceId, systemId, versionId)}/validation-results`,
    { signal },
  );
}

export function getWorkspaceDesignSystemDefault(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceDesignSystemDefaultOut | null> {
  return api.get<WorkspaceDesignSystemDefaultOut | null>(
    `${systemsPath(workspaceId)}/default-assignment`,
    {
      signal,
    },
  );
}

export function listWorkspaceDesignSystemComponentCatalogs(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<ComponentCatalogV1[]> {
  return api.get<ComponentCatalogV1[]>(`${systemsPath(workspaceId)}/component-catalogs`, {
    signal,
  });
}

export function setWorkspaceDesignSystemDefault(
  workspaceId: string,
  payload: WorkspaceDesignSystemDefaultSetRequest,
  idempotencyKey: string,
): Promise<WorkspaceDesignSystemDefaultOut> {
  return api.put<WorkspaceDesignSystemDefaultOut>(
    `${systemsPath(workspaceId)}/default-assignment`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}
