import {
  platformListPlatformDeliveryDomains,
  platformListPlatformDeliveryIssues,
  platformListPlatformDeliveryRules,
  platformListPlatformDeliveryStorage,
  type PageDataPlatformDeliveryDomainOut,
  type PageDataPlatformDeliveryIssueOut,
  type PageDataPlatformDeliveryRuleOut,
  type PageDataPlatformDeliveryStorageOut,
  type PlatformListPlatformDeliveryIssuesData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class PlatformSiteDeliveryApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformSiteDeliveryApiError";
    this.status = status;
  }
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformSiteDeliveryApiError(
      "PLATFORM_SITE_DELIVERY_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
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

export function listDeliveryRules(): Promise<PageDataPlatformDeliveryRuleOut> {
  return platformListPlatformDeliveryRules({
    client: platformApiClient,
    query: { page: 1, size: 100 },
  }).then(unwrap);
}
