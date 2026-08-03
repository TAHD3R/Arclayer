import {
  platformApplyPlatformDeliveryPolicy,
  platformCreateStorageProfile,
  platformDeleteStorageProfile,
  platformGetPlatformDeliveryDomainDossier,
  platformGetPlatformDeliveryContinuityPolicy,
  platformGetPlatformDeliveryIssueDossier,
  platformGetPlatformDeliveryStorageDossier,
  platformListPlatformDeliveryDomains,
  platformListPlatformDeliveryIssues,
  platformListPlatformDeliveryRules,
  platformListPlatformDeliveryStorage,
  platformListStorageProfiles,
  platformPreviewPlatformDeliveryPolicy,
  platformReconcilePlatformDeliveryIssue,
  platformRecoverPlatformDeliveryDomain,
  platformRestorePlatformDeliveryIssue,
  platformRetryPlatformDeliveryIssue,
  platformTestPlatformDeliveryStorage,
  platformUpdateStorageProfile,
  type PlatformDeliveryContinuityPolicyOut,
  type PlatformDeliveryDomainDossierOut,
  type PlatformDeliveryIssueDossierOut,
  type PlatformDeliveryOperationOut,
  type PlatformDeliveryOperationRequestIn,
  type PlatformDeliveryPolicyApplyOut,
  type PlatformDeliveryPolicyPreviewOut,
  type PlatformDeliveryStorageDossierOut,
  type PageDataPlatformDeliveryDomainOut,
  type PageDataPlatformDeliveryIssueOut,
  type PageDataPlatformDeliveryRuleOut,
  type PageDataPlatformDeliveryStorageOut,
  type PlatformListPlatformDeliveryIssuesData,
  type StorageProfileCreateRequest,
  type StorageProfileDeleteOut,
  type StorageProfileListOut,
  type StorageProfileOut,
  type StorageProfileUpdateRequest,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export type DeliveryIssueAction = Extract<
  PlatformDeliveryOperationOut["action"],
  "retry" | "reconcile" | "restore"
>;
export type DeliveryOperationRequest = PlatformDeliveryOperationRequestIn;

export class PlatformSiteDeliveryApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformSiteDeliveryApiError";
    this.status = status;
  }
}

function errorCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return errorCode(candidate.error) ?? errorCode(candidate.code) ?? errorCode(candidate.message);
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformSiteDeliveryApiError(
      errorCode(result.error) ?? "PLATFORM_SITE_DELIVERY_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || result.data.data == null) {
    throw new PlatformSiteDeliveryApiError(
      result.data?.error ?? "PLATFORM_SITE_DELIVERY_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

export function listDeliveryIssues(
  query?: NonNullable<PlatformListPlatformDeliveryIssuesData["query"]>,
): Promise<PageDataPlatformDeliveryIssueOut> {
  return platformListPlatformDeliveryIssues({ client: platformApiClient, query }).then(unwrap);
}

export function listDeliveryDomains(): Promise<PageDataPlatformDeliveryDomainOut> {
  return platformListPlatformDeliveryDomains({
    client: platformApiClient,
    query: { page: 1, size: 100 },
  }).then(unwrap);
}

export function listDeliveryStorage(): Promise<PageDataPlatformDeliveryStorageOut> {
  return platformListPlatformDeliveryStorage({
    client: platformApiClient,
    query: { page: 1, size: 100 },
  }).then(unwrap);
}

export function listStorageProfiles(): Promise<StorageProfileListOut> {
  return platformListStorageProfiles({ client: platformApiClient }).then(unwrap);
}

export function createStorageProfile(
  body: StorageProfileCreateRequest,
): Promise<StorageProfileOut> {
  return platformCreateStorageProfile({ body, client: platformApiClient }).then(unwrap);
}

export function updateStorageProfile(
  profileId: string,
  body: StorageProfileUpdateRequest,
): Promise<StorageProfileOut> {
  return platformUpdateStorageProfile({
    body,
    client: platformApiClient,
    path: { profile_id: profileId },
  }).then(unwrap);
}

export function deleteStorageProfile(profileId: string): Promise<StorageProfileDeleteOut> {
  return platformDeleteStorageProfile({
    client: platformApiClient,
    path: { profile_id: profileId },
  }).then(unwrap);
}

export function listDeliveryRules(): Promise<PageDataPlatformDeliveryRuleOut> {
  return platformListPlatformDeliveryRules({
    client: platformApiClient,
    query: { page: 1, size: 100 },
  }).then(unwrap);
}

export function getDeliveryContinuityPolicy(): Promise<PlatformDeliveryContinuityPolicyOut> {
  return platformGetPlatformDeliveryContinuityPolicy({ client: platformApiClient }).then(unwrap);
}

export function getDeliveryIssueDossier(issueId: string): Promise<PlatformDeliveryIssueDossierOut> {
  return platformGetPlatformDeliveryIssueDossier({
    client: platformApiClient,
    path: { issue_id: issueId },
  }).then(unwrap);
}

export function executeDeliveryIssueAction(
  issueId: string,
  action: DeliveryIssueAction,
  body: DeliveryOperationRequest,
): Promise<PlatformDeliveryOperationOut> {
  const options = { body, client: platformApiClient, path: { issue_id: issueId } };
  if (action === "retry") return platformRetryPlatformDeliveryIssue(options).then(unwrap);
  if (action === "reconcile") return platformReconcilePlatformDeliveryIssue(options).then(unwrap);
  return platformRestorePlatformDeliveryIssue(options).then(unwrap);
}

export function getDeliveryDomainDossier(
  bindingId: string,
): Promise<PlatformDeliveryDomainDossierOut> {
  return platformGetPlatformDeliveryDomainDossier({
    client: platformApiClient,
    path: { binding_id: bindingId },
  }).then(unwrap);
}

export function recoverDeliveryDomain(
  bindingId: string,
  body: DeliveryOperationRequest,
): Promise<PlatformDeliveryOperationOut> {
  return platformRecoverPlatformDeliveryDomain({
    body,
    client: platformApiClient,
    path: { binding_id: bindingId },
  }).then(unwrap);
}

export function getDeliveryStorageDossier(
  profileId: string,
): Promise<PlatformDeliveryStorageDossierOut> {
  return platformGetPlatformDeliveryStorageDossier({
    client: platformApiClient,
    path: { profile_id: profileId },
  }).then(unwrap);
}

export function testDeliveryStorage(
  profileId: string,
  body: DeliveryOperationRequest,
): Promise<PlatformDeliveryOperationOut> {
  return platformTestPlatformDeliveryStorage({
    body,
    client: platformApiClient,
    path: { profile_id: profileId },
  }).then(unwrap);
}

export function previewDeliveryPolicy(
  expectedRevision: number,
  continuityWindowSeconds: number,
): Promise<PlatformDeliveryPolicyPreviewOut> {
  return platformPreviewPlatformDeliveryPolicy({
    client: platformApiClient,
    body: { expectedRevision, continuityWindowSeconds },
  }).then(unwrap);
}

export function applyDeliveryPolicy(
  previewId: string,
  reason: string,
  idempotencyKey: string,
): Promise<PlatformDeliveryPolicyApplyOut> {
  return platformApplyPlatformDeliveryPolicy({
    client: platformApiClient,
    path: { preview_id: previewId },
    body: { idempotencyKey, reason },
  }).then(unwrap);
}
