import type {
  SkillCursorPageSkillInstallationOut,
  SkillCursorPageSkillPackageSummaryOut,
  SkillCursorPageSkillVersionSummaryOut,
  SkillInstallationCreateRequest,
  SkillInstallationImpactOut,
  SkillInstallationOut,
  SkillInstallationRemovalOut,
  SkillInstallationRepinOut,
  SkillInstallationRepinRequest,
  SkillInstallationUpdateRequest,
  OfficialSkillCatalogDetailOut,
  OfficialSkillCatalogItemOut,
  SkillCursorPageOfficialSkillCatalogItemOut,
  SkillGitHubImportAcceptedOut,
  SkillGitHubImportCreateRequest,
  SkillGitHubImportOut,
  SkillPackageCreateOut,
  SkillPackageCreateRequest,
  SkillPackageDetailOut,
  SkillPackageArchiveOut,
  SkillPackageImpactOut,
  SkillPackageSummaryOut,
  SkillValidationResultOut,
  SkillUpdatePreviewCreateRequest,
  SkillUpdatePreviewOut,
  SkillVersionCreateRequest,
  SkillVersionDetailOut,
  WorkspaceSkillsCapabilitiesOut,
} from "@arclayer/openapi";

import { api } from "@/lib/http";

export const WORKSPACE_SKILLS_QUERY_KEY = ["workspace", "skills"] as const;

export type WorkspaceSkillGrantOptions = {
  installations: SkillInstallationOut[];
  officialPackages: OfficialSkillCatalogItemOut[];
  workspacePackages: SkillPackageSummaryOut[];
};

function skillsPath(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/skills`;
}

function packagePath(workspaceId: string, packageId: string): string {
  return `${skillsPath(workspaceId)}/packages/${encodeURIComponent(packageId)}`;
}

function versionPath(workspaceId: string, packageId: string, versionId: string): string {
  return `${packagePath(workspaceId, packageId)}/versions/${encodeURIComponent(versionId)}`;
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

async function collectCursorPages<T>(
  loadPage: (cursor?: string) => Promise<{ items?: T[]; nextCursor?: string | null }>,
): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await loadPage(cursor);
    items.push(...(page.items ?? []));
    const nextCursor = page.nextCursor ?? undefined;
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw new Error("Workspace Skills pagination returned a repeated cursor");
    }
    if (nextCursor) seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);
  return items;
}

export function getWorkspaceSkillsCapabilities(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceSkillsCapabilitiesOut> {
  return api.get<WorkspaceSkillsCapabilitiesOut>(`${skillsPath(workspaceId)}/capabilities`, {
    signal,
  });
}

export function createWorkspaceSkillGitHubImport(
  workspaceId: string,
  payload: SkillGitHubImportCreateRequest,
  idempotencyKey: string,
): Promise<SkillGitHubImportAcceptedOut> {
  return api.post<SkillGitHubImportAcceptedOut>(
    `${skillsPath(workspaceId)}/imports`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function createWorkspaceSkillZipImport(
  workspaceId: string,
  file: File,
  idempotencyKey: string,
): Promise<SkillPackageCreateOut> {
  const form = new FormData();
  form.append("package", file);
  return api.post<SkillPackageCreateOut>(
    `${skillsPath(workspaceId)}/imports/zip`,
    form,
    idempotencyOptions(idempotencyKey),
  );
}

export function getWorkspaceSkillGitHubImport(
  workspaceId: string,
  importId: string,
  signal?: AbortSignal,
): Promise<SkillGitHubImportOut> {
  return api.get<SkillGitHubImportOut>(
    `${skillsPath(workspaceId)}/imports/${encodeURIComponent(importId)}`,
    { signal },
  );
}

export function createWorkspaceSkillGitHubRefresh(
  workspaceId: string,
  packageId: string,
  idempotencyKey: string,
): Promise<SkillGitHubImportAcceptedOut> {
  return api.post<SkillGitHubImportAcceptedOut>(
    `${packagePath(workspaceId, packageId)}/refreshes`,
    undefined,
    idempotencyOptions(idempotencyKey),
  );
}

export function listOfficialSkillCatalog(
  workspaceId: string,
  params: { q?: string; limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<SkillCursorPageOfficialSkillCatalogItemOut> {
  const { signal, ...query } = params;
  return api.get<SkillCursorPageOfficialSkillCatalogItemOut>(
    `${skillsPath(workspaceId)}/catalog${queryString(query)}`,
    { signal },
  );
}

export function getOfficialSkillCatalogPackage(
  workspaceId: string,
  packageId: string,
  signal?: AbortSignal,
): Promise<OfficialSkillCatalogDetailOut> {
  return api.get<OfficialSkillCatalogDetailOut>(
    `${skillsPath(workspaceId)}/catalog/${encodeURIComponent(packageId)}`,
    { signal },
  );
}

export function listWorkspaceSkillPackages(
  workspaceId: string,
  params: { q?: string; limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<SkillCursorPageSkillPackageSummaryOut> {
  const { signal, ...query } = params;
  return api.get<SkillCursorPageSkillPackageSummaryOut>(
    `${skillsPath(workspaceId)}/packages${queryString(query)}`,
    { signal },
  );
}

export function getWorkspaceSkillPackage(
  workspaceId: string,
  packageId: string,
  signal?: AbortSignal,
): Promise<SkillPackageDetailOut> {
  return api.get<SkillPackageDetailOut>(packagePath(workspaceId, packageId), { signal });
}

export function getWorkspaceSkillPackageImpact(
  workspaceId: string,
  packageId: string,
  signal?: AbortSignal,
): Promise<SkillPackageImpactOut> {
  return api.get<SkillPackageImpactOut>(`${packagePath(workspaceId, packageId)}/impact`, {
    signal,
  });
}

export function archiveWorkspaceSkillPackage(
  workspaceId: string,
  packageId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<SkillPackageArchiveOut> {
  return api.delete<SkillPackageArchiveOut>(
    `${packagePath(workspaceId, packageId)}${queryString({ expectedRevision })}`,
    idempotencyOptions(idempotencyKey),
  );
}

export function createWorkspaceSkillPackage(
  workspaceId: string,
  payload: SkillPackageCreateRequest,
  idempotencyKey: string,
): Promise<SkillPackageCreateOut> {
  return api.post<SkillPackageCreateOut>(
    `${skillsPath(workspaceId)}/packages`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function listWorkspaceSkillVersions(
  workspaceId: string,
  packageId: string,
  params: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<SkillCursorPageSkillVersionSummaryOut> {
  const { signal, ...query } = params;
  return api.get<SkillCursorPageSkillVersionSummaryOut>(
    `${packagePath(workspaceId, packageId)}/versions${queryString(query)}`,
    { signal },
  );
}

export function getWorkspaceSkillVersion(
  workspaceId: string,
  packageId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<SkillVersionDetailOut> {
  return api.get<SkillVersionDetailOut>(versionPath(workspaceId, packageId, versionId), {
    signal,
  });
}

export function createWorkspaceSkillVersion(
  workspaceId: string,
  packageId: string,
  payload: SkillVersionCreateRequest,
  idempotencyKey: string,
): Promise<SkillVersionDetailOut> {
  return api.post<SkillVersionDetailOut>(
    `${packagePath(workspaceId, packageId)}/versions`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function validateWorkspaceSkillVersion(
  workspaceId: string,
  packageId: string,
  versionId: string,
  idempotencyKey: string,
): Promise<SkillValidationResultOut> {
  return api.post<SkillValidationResultOut>(
    `${versionPath(workspaceId, packageId, versionId)}/validations`,
    { policyVersion: 1 },
    idempotencyOptions(idempotencyKey),
  );
}

export function listWorkspaceSkillValidationResults(
  workspaceId: string,
  packageId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<SkillValidationResultOut[]> {
  return api.get<SkillValidationResultOut[]>(
    `${versionPath(workspaceId, packageId, versionId)}/validation-results`,
    { signal },
  );
}

export function listWorkspaceSkillInstallations(
  workspaceId: string,
  params: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<SkillCursorPageSkillInstallationOut> {
  const { signal, ...query } = params;
  return api.get<SkillCursorPageSkillInstallationOut>(
    `${skillsPath(workspaceId)}/installations${queryString(query)}`,
    { signal },
  );
}

export async function listWorkspaceSkillGrantOptions(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceSkillGrantOptions> {
  const [installations, officialPackages, workspacePackages] = await Promise.all([
    collectCursorPages((cursor) =>
      listWorkspaceSkillInstallations(workspaceId, { cursor, limit: 100, signal }),
    ),
    collectCursorPages((cursor) =>
      listOfficialSkillCatalog(workspaceId, { cursor, limit: 100, signal }),
    ),
    collectCursorPages((cursor) =>
      listWorkspaceSkillPackages(workspaceId, { cursor, limit: 100, signal }),
    ),
  ]);
  return { installations, officialPackages, workspacePackages };
}

export function createWorkspaceSkillInstallation(
  workspaceId: string,
  payload: SkillInstallationCreateRequest,
  idempotencyKey: string,
): Promise<SkillInstallationOut> {
  return api.post<SkillInstallationOut>(
    `${skillsPath(workspaceId)}/installations`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function getWorkspaceSkillInstallation(
  workspaceId: string,
  installationId: string,
  signal?: AbortSignal,
): Promise<SkillInstallationOut> {
  return api.get<SkillInstallationOut>(
    `${skillsPath(workspaceId)}/installations/${encodeURIComponent(installationId)}`,
    { signal },
  );
}

export function updateWorkspaceSkillInstallation(
  workspaceId: string,
  installationId: string,
  payload: SkillInstallationUpdateRequest,
): Promise<SkillInstallationOut> {
  return api.patch<SkillInstallationOut>(
    `${skillsPath(workspaceId)}/installations/${encodeURIComponent(installationId)}`,
    payload,
  );
}

export function createWorkspaceSkillUpdatePreview(
  workspaceId: string,
  installationId: string,
  payload: SkillUpdatePreviewCreateRequest,
  idempotencyKey: string,
): Promise<SkillUpdatePreviewOut> {
  return api.post<SkillUpdatePreviewOut>(
    `${skillsPath(workspaceId)}/installations/${encodeURIComponent(installationId)}/update-previews`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function repinWorkspaceSkillInstallation(
  workspaceId: string,
  installationId: string,
  payload: SkillInstallationRepinRequest,
  idempotencyKey: string,
): Promise<SkillInstallationRepinOut> {
  return api.post<SkillInstallationRepinOut>(
    `${skillsPath(workspaceId)}/installations/${encodeURIComponent(installationId)}/updates`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export function getWorkspaceSkillInstallationImpact(
  workspaceId: string,
  installationId: string,
  signal?: AbortSignal,
): Promise<SkillInstallationImpactOut> {
  return api.get<SkillInstallationImpactOut>(
    `${skillsPath(workspaceId)}/installations/${encodeURIComponent(installationId)}/impact`,
    { signal },
  );
}

export function removeWorkspaceSkillInstallation(
  workspaceId: string,
  installationId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<SkillInstallationRemovalOut> {
  return api.delete<SkillInstallationRemovalOut>(
    `${skillsPath(workspaceId)}/installations/${encodeURIComponent(installationId)}${queryString({ expectedRevision })}`,
    idempotencyOptions(idempotencyKey),
  );
}
