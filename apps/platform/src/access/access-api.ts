import {
  platformGetCurrentPlatformMfaReadiness,
  platformGetPlatformInvitationOptions,
  platformGetCurrentTeamIdentity,
  platformGetPlatformInvitation,
  platformGetPlatformSignInReadiness,
  platformListCurrentPlatformSessions,
  platformListPlatformInvitations,
  platformListPlatformPermissions,
  platformListPlatformRoles,
  platformListPlatformTeam,
  platformInvitePlatformOperator,
  platformRevokeCurrentPlatformSession,
  platformRevokeOtherCurrentPlatformSessions,
  type PlatformInvitationCreateRequest,
  type PlatformInvitationDetailOut,
  type PlatformInvitationOptionsOut,
  type PlatformMfaReadinessOut,
  type PlatformPermissionCatalogItemOut,
  type PlatformRoleCatalogItemOut,
  type PlatformSessionInventoryItemOut,
  type PlatformSessionRevokeRequest,
  type PlatformSignInReadinessOut,
  type PlatformMutationReceipt,
  type PlatformTeamIdentityOut,
  type PlatformTeamQueueOut,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class PlatformAccessApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformAccessApiError";
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
    throw new PlatformAccessApiError(
      errorCode(result.error) ?? "PLATFORM_ACCESS_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
    throw new PlatformAccessApiError(
      result.data?.error ?? "PLATFORM_ACCESS_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

export const getPlatformTeam = async (): Promise<PlatformTeamQueueOut> =>
  unwrap(await platformListPlatformTeam({ client: platformApiClient }));
export const getCurrentPlatformTeamIdentity = async (): Promise<PlatformTeamIdentityOut> =>
  unwrap(await platformGetCurrentTeamIdentity({ client: platformApiClient }));
export const invitePlatformOperator = async (
  body: PlatformInvitationCreateRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(await platformInvitePlatformOperator({ client: platformApiClient, body }));
export const getPlatformInvitationOptions = async (
  q: string | null,
): Promise<PlatformInvitationOptionsOut> =>
  unwrap(await platformGetPlatformInvitationOptions({ client: platformApiClient, query: { q } }));
export const listPlatformInvitations = async (): Promise<PlatformInvitationDetailOut[]> =>
  unwrap(await platformListPlatformInvitations({ client: platformApiClient }));
export const getPlatformInvitation = async (
  invitationId: string,
): Promise<PlatformInvitationDetailOut> =>
  unwrap(
    await platformGetPlatformInvitation({
      client: platformApiClient,
      path: { invitation_id: invitationId },
    }),
  );
export const listPlatformRoles = async (): Promise<PlatformRoleCatalogItemOut[]> =>
  unwrap(await platformListPlatformRoles({ client: platformApiClient }));
export const listPlatformPermissions = async (): Promise<PlatformPermissionCatalogItemOut[]> =>
  unwrap(await platformListPlatformPermissions({ client: platformApiClient }));
export const getSignInReadiness = async (): Promise<PlatformSignInReadinessOut> =>
  unwrap(await platformGetPlatformSignInReadiness({ client: platformApiClient }));
export const getCurrentSessions = async (): Promise<PlatformSessionInventoryItemOut[]> =>
  unwrap(await platformListCurrentPlatformSessions({ client: platformApiClient }));
export const revokeCurrentPlatformSession = async (
  sessionId: string,
  body: PlatformSessionRevokeRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformRevokeCurrentPlatformSession({
      body,
      client: platformApiClient,
      path: { session_id: sessionId },
    }),
  );
export const revokeOtherCurrentPlatformSessions = async (
  body: PlatformSessionRevokeRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(await platformRevokeOtherCurrentPlatformSessions({ body, client: platformApiClient }));
export const getCurrentMfaReadiness = async (): Promise<PlatformMfaReadinessOut> =>
  unwrap(await platformGetCurrentPlatformMfaReadiness({ client: platformApiClient }));
