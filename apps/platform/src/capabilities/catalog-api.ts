import {
  platformListPlatformCapabilities,
  type PlatformCapabilityCatalogOut,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

export class PlatformCapabilityCatalogApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformCapabilityCatalogApiError";
    this.code = code;
    this.status = status;
  }
}

function extractErrorCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return (
    extractErrorCode(candidate.error) ??
    extractErrorCode(candidate.code) ??
    extractErrorCode(candidate.message)
  );
}

export async function getPlatformCapabilityCatalog(): Promise<PlatformCapabilityCatalogOut> {
  try {
    const result = await platformListPlatformCapabilities({ client: platformApiClient });
    if (result.error !== undefined) {
      throw new PlatformCapabilityCatalogApiError(
        extractErrorCode(result.error) ?? "PLATFORM_CAPABILITY_CATALOG_REQUEST_FAILED",
        result.response?.status,
      );
    }
    if (!result.data?.data || result.data.error) {
      throw new PlatformCapabilityCatalogApiError(
        result.data?.error ?? "PLATFORM_CAPABILITY_CATALOG_RESPONSE_INVALID",
        result.response?.status,
      );
    }
    return result.data.data;
  } catch (error) {
    if (error instanceof PlatformCapabilityCatalogApiError) throw error;
    throw new PlatformCapabilityCatalogApiError(
      error instanceof TypeError
        ? "PLATFORM_CAPABILITY_CATALOG_NETWORK_ERROR"
        : "PLATFORM_CAPABILITY_CATALOG_REQUEST_FAILED",
    );
  }
}
