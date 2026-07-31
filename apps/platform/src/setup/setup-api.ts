import {
  platformBootstrapInstance,
  platformGetPlatformSetupState,
  type PlatformBootstrapOut,
  type PlatformSetupStateOut,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

export type PlatformSetupStatus = "uninitialized" | "ready" | "repair_required";

export type PlatformSetupState = Readonly<{
  status: PlatformSetupStatus;
  repairReason: string | null;
}>;

type ApiEnvelope<T> = Readonly<{
  data?: T | null;
  error?: string | null;
}>;

type SdkResult<T> = Readonly<{
  data?: ApiEnvelope<T>;
  error?: unknown;
  response?: Response;
}>;

export class PlatformSetupApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformSetupApiError";
    this.code = code;
    this.status = status;
  }
}

function extractErrorCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = extractErrorCode(item);
      if (code) return code;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return (
    extractErrorCode(candidate.error) ??
    extractErrorCode(candidate.code) ??
    extractErrorCode(candidate.message)
  );
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformSetupApiError(
      extractErrorCode(result.error) ?? "PLATFORM_SETUP_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error) {
    throw new PlatformSetupApiError(
      result.data?.error ?? "PLATFORM_SETUP_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  if (!result.data.data) {
    throw new PlatformSetupApiError("PLATFORM_SETUP_RESPONSE_INVALID", result.response?.status);
  }
  return result.data.data;
}

function normalizeSetupState(state: PlatformSetupStateOut): PlatformSetupState {
  if (
    state.status !== "uninitialized" &&
    state.status !== "ready" &&
    state.status !== "repair_required"
  ) {
    throw new PlatformSetupApiError("PLATFORM_SETUP_RESPONSE_INVALID");
  }
  if (state.status !== "repair_required" && state.repairReason != null) {
    throw new PlatformSetupApiError("PLATFORM_SETUP_RESPONSE_INVALID");
  }
  return { status: state.status, repairReason: state.repairReason ?? null };
}

function normalizeRequestError(error: unknown): PlatformSetupApiError {
  if (error instanceof PlatformSetupApiError) return error;
  return new PlatformSetupApiError(
    error instanceof TypeError ? "PLATFORM_SETUP_NETWORK_ERROR" : "PLATFORM_SETUP_REQUEST_FAILED",
  );
}

export async function getPlatformSetupState(): Promise<PlatformSetupState> {
  try {
    const result = await platformGetPlatformSetupState({ client: platformApiClient });
    return normalizeSetupState(unwrap(result));
  } catch (error) {
    throw normalizeRequestError(error);
  }
}

export async function bootstrapPlatformInstance(
  input: Readonly<{
    username: string;
    email: string;
    displayName: string;
    password: string;
  }>,
): Promise<PlatformBootstrapOut> {
  try {
    return unwrap(
      await platformBootstrapInstance({
        body: input,
        client: platformApiClient,
      }),
    );
  } catch (error) {
    throw normalizeRequestError(error);
  }
}
