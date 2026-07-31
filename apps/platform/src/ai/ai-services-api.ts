import {
  platformGetPlatformAiProviderReadiness,
  platformListPlatformAiTasks,
  type PlatformAiProviderReadinessOut,
  type PlatformAiTaskOut,
  type PageDataPlatformAiTaskOut,
  type PlatformListPlatformAiTasksData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class PlatformAiServicesApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformAiServicesApiError";
    this.status = status;
  }
}

function code(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return code(candidate.error) ?? code(candidate.code) ?? code(candidate.message);
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformAiServicesApiError(
      code(result.error) ?? "PLATFORM_AI_SERVICES_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
    throw new PlatformAiServicesApiError(
      result.data?.error ?? "PLATFORM_AI_SERVICES_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

export function listAiTasks(
  query?: NonNullable<PlatformListPlatformAiTasksData["query"]>,
): Promise<PageDataPlatformAiTaskOut> {
  return platformListPlatformAiTasks({ client: platformApiClient, query }).then(unwrap);
}

export function getAiProviderReadiness(): Promise<PlatformAiProviderReadinessOut> {
  return platformGetPlatformAiProviderReadiness({ client: platformApiClient }).then(unwrap);
}

export type { PlatformAiTaskOut };
