import {
  platformListCommercePlans,
  platformListPlatformCommerceSubscriptions,
  type PlatformCommercePlanCatalogOut,
  type PlatformCommerceSubscriptionListOut,
  type PlatformListCommercePlansData,
  type PlatformListPlatformCommerceSubscriptionsData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class PlatformCommerceApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformCommerceApiError";
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
    throw new PlatformCommerceApiError(
      errorCode(result.error) ?? "PLATFORM_COMMERCE_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
    throw new PlatformCommerceApiError(
      result.data?.error ?? "PLATFORM_COMMERCE_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

export async function listCommercePlans(
  query?: NonNullable<PlatformListCommercePlansData["query"]>,
): Promise<PlatformCommercePlanCatalogOut> {
  return unwrap(await platformListCommercePlans({ client: platformApiClient, query }));
}

export async function listCommerceSubscriptions(
  query?: NonNullable<PlatformListPlatformCommerceSubscriptionsData["query"]>,
): Promise<PlatformCommerceSubscriptionListOut> {
  return unwrap(
    await platformListPlatformCommerceSubscriptions({ client: platformApiClient, query }),
  );
}
