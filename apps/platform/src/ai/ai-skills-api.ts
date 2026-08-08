import {
  platformArchivePlatformSkill,
  platformCreatePlatformSkill,
  platformCreatePlatformSkillVersion,
  platformGetPlatformSkill,
  platformGetPlatformSkillCapabilities,
  platformImportPlatformSkillGithub,
  platformImportPlatformSkillZip,
  platformListPlatformSkills,
  platformReplacePlatformSkill,
  platformRestorePlatformSkill,
  platformUpdatePlatformSkill,
  type PageDataPlatformSkillPackageSummaryOut,
  type PlatformSkillCapabilitiesOut,
  type PlatformSkillGitHubImportRequest,
  type PlatformListPlatformSkillsData,
  type PlatformSkillPackageCreateRequest,
  type PlatformSkillPackageDetailOut,
  type PlatformSkillPackageReplaceRequest,
  type PlatformSkillPackageUpdateRequest,
  type PlatformSkillVersionCreateRequest,
  type PlatformSkillVersionOut,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{
  data?: ApiEnvelope<T>;
  error?: unknown;
  response?: Response;
}>;

export class PlatformAiSkillsApiError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = "PlatformAiSkillsApiError";
  }
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new PlatformAiSkillsApiError(
      result.data?.error ?? "PLATFORM_AI_SKILLS_REQUEST_FAILED",
      result.response?.status,
    );
  }
  return result.data.data;
}

export function listPlatformSkills(
  query?: NonNullable<PlatformListPlatformSkillsData["query"]>,
): Promise<PageDataPlatformSkillPackageSummaryOut> {
  return platformListPlatformSkills({ client: platformApiClient, query }).then(unwrap);
}

export function getPlatformSkill(packageId: string): Promise<PlatformSkillPackageDetailOut> {
  return platformGetPlatformSkill({
    client: platformApiClient,
    path: { package_id: packageId },
  }).then(unwrap);
}

export function getPlatformSkillCapabilities(): Promise<PlatformSkillCapabilitiesOut> {
  return platformGetPlatformSkillCapabilities({ client: platformApiClient }).then(unwrap);
}

export function createPlatformSkill(
  body: PlatformSkillPackageCreateRequest,
  idempotencyKey: string,
): Promise<PlatformSkillPackageDetailOut> {
  return platformCreatePlatformSkill({
    body,
    client: platformApiClient,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function updatePlatformSkill(
  packageId: string,
  body: PlatformSkillPackageUpdateRequest,
): Promise<PlatformSkillPackageDetailOut> {
  return platformUpdatePlatformSkill({
    body,
    client: platformApiClient,
    path: { package_id: packageId },
  }).then(unwrap);
}

export function replacePlatformSkill(
  packageId: string,
  body: PlatformSkillPackageReplaceRequest,
  idempotencyKey: string,
): Promise<PlatformSkillPackageDetailOut> {
  return platformReplacePlatformSkill({
    body,
    client: platformApiClient,
    headers: { "Idempotency-Key": idempotencyKey },
    path: { package_id: packageId },
  }).then(unwrap);
}

export function importPlatformSkillFromGitHub(
  body: PlatformSkillGitHubImportRequest,
  idempotencyKey: string,
): Promise<PlatformSkillPackageDetailOut> {
  return platformImportPlatformSkillGithub({
    body,
    client: platformApiClient,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function importPlatformSkillZip(
  file: File,
  idempotencyKey: string,
): Promise<PlatformSkillPackageDetailOut> {
  return platformImportPlatformSkillZip({
    body: { package: file },
    client: platformApiClient,
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function createPlatformSkillVersion(
  packageId: string,
  body: PlatformSkillVersionCreateRequest,
  idempotencyKey: string,
): Promise<PlatformSkillVersionOut> {
  return platformCreatePlatformSkillVersion({
    body,
    client: platformApiClient,
    headers: { "Idempotency-Key": idempotencyKey },
    path: { package_id: packageId },
  }).then(unwrap);
}

export function archivePlatformSkill(
  packageId: string,
  expectedRevision: number,
): Promise<PlatformSkillPackageDetailOut> {
  return platformArchivePlatformSkill({
    client: platformApiClient,
    path: { package_id: packageId },
    query: { expectedRevision },
  }).then(unwrap);
}

export function restorePlatformSkill(
  packageId: string,
  expectedRevision: number,
): Promise<PlatformSkillPackageDetailOut> {
  return platformRestorePlatformSkill({
    client: platformApiClient,
    path: { package_id: packageId },
    query: { expectedRevision },
  }).then(unwrap);
}
