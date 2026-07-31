import {
  createApiClient,
  domainWorkspacesAssignFeatureAccess,
  domainWorkspacesMoveFeatureAccess,
  domainWorkspacesReadFeatureAccess,
  domainWorkspacesRevokeFeatureAccess,
  type FeatureAccessAssignRequest,
  type FeatureAccessMoveRequest,
  type FeatureAccessMutationOut,
  type FeatureAccessReadResult,
} from "@arclayer/openapi";

import { getAppConfig } from "@/lib/config/app-config";
import { ApiError } from "@/lib/http";
import { getLocaleHeaders, getRequestCredentials } from "@/lib/http/request-context";
import { useAuthStore } from "@/stores/use-auth-store";

export type {
  FeatureAccessAllocationOut,
  FeatureAccessCapabilityProjection,
  FeatureAccessMutationOut,
  FeatureAccessReadResult,
  ManagerFeatureAccessCapability,
  MemberFeatureAccessCapability,
} from "@arclayer/openapi";

const productApiClient = createApiClient({
  auth: () => useAuthStore.getState().accessToken ?? undefined,
  baseUrl: getAppConfig().apiBaseUrl || undefined,
  credentials: getRequestCredentials(),
});

productApiClient.interceptors.request.use((request) => {
  const headers = new Headers(request.headers);
  const localeHeaders = getLocaleHeaders();
  if (localeHeaders["accept-language"])
    headers.set("accept-language", localeHeaders["accept-language"]);
  if (localeHeaders["x-locale"]) headers.set("x-locale", localeHeaders["x-locale"]);

  const csrfToken = readCookie("csrf_token");
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  return new Request(request, { headers });
});

type GeneratedResponse<T> = Readonly<{
  data?: Readonly<{ data?: T | null }>;
  error?: unknown;
  response?: Response;
}>;

function unwrapGeneratedResponse<T>(result: GeneratedResponse<T>, operation: string): T {
  if (result.error !== undefined) throw generatedApiError(result, operation);
  const data = result.data?.data;
  if (data == null) {
    throw new ApiError({
      status: result.response?.status ?? 500,
      error: "PRODUCT_API_RESPONSE_INVALID",
      message: `${operation} returned no data`,
    });
  }
  return data;
}

function generatedApiError(result: GeneratedResponse<unknown>, operation: string): ApiError {
  const payload =
    result.error && typeof result.error === "object"
      ? (result.error as Record<string, unknown>)
      : null;
  const message = payload?.message;
  const error = payload?.error;
  const meta = payload?.meta;
  return new ApiError({
    status: result.response?.status ?? 0,
    message:
      typeof message === "string" && message
        ? message
        : result.error instanceof Error
          ? result.error.message
          : `${operation} failed`,
    ...(typeof error === "string" && error ? { error } : {}),
    ...(meta !== undefined ? { meta } : {}),
  });
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const part = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : null;
}

export async function readWorkspaceFeatureAccess(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<FeatureAccessReadResult> {
  const result = await domainWorkspacesReadFeatureAccess({
    client: productApiClient,
    path: { workspace_id: workspaceId },
    signal,
  });
  return unwrapGeneratedResponse(result, "Read feature access");
}

export async function assignWorkspaceFeatureAccess(
  workspaceId: string,
  entitlementKey: string,
  payload: FeatureAccessAssignRequest,
  idempotencyKey: string,
): Promise<FeatureAccessMutationOut> {
  const result = await domainWorkspacesAssignFeatureAccess({
    client: productApiClient,
    path: { workspace_id: workspaceId, entitlement_key: entitlementKey },
    body: payload,
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return unwrapGeneratedResponse(result, "Assign feature access");
}

export async function moveWorkspaceFeatureAccess(
  workspaceId: string,
  entitlementKey: string,
  payload: FeatureAccessMoveRequest,
  idempotencyKey: string,
): Promise<FeatureAccessMutationOut> {
  const result = await domainWorkspacesMoveFeatureAccess({
    client: productApiClient,
    path: { workspace_id: workspaceId, entitlement_key: entitlementKey },
    body: payload,
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return unwrapGeneratedResponse(result, "Move feature access");
}

export async function revokeWorkspaceFeatureAccess(
  workspaceId: string,
  entitlementKey: string,
  membershipId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<FeatureAccessMutationOut> {
  const result = await domainWorkspacesRevokeFeatureAccess({
    client: productApiClient,
    path: {
      workspace_id: workspaceId,
      entitlement_key: entitlementKey,
      membership_id: membershipId,
    },
    query: { expectedRevision },
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return unwrapGeneratedResponse(result, "Revoke feature access");
}
