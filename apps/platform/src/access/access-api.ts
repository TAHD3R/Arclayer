import {
  platformApplyPlatformCustomRoleRevision,
  platformAssignPlatformOperatorRoles,
  platformBeginCurrentPlatformTotpMethod,
  platformBeginCurrentPlatformWebauthnMethod,
  platformBeginPlatformStepUpWebauthn,
  platformCompleteCurrentPlatformWebauthnMethod,
  platformCompletePlatformStepUpWebauthn,
  platformConfirmCurrentPlatformTotpMethod,
  platformCopyPlatformCustomRole,
  platformCreatePlatformCustomRole,
  platformGetCurrentPlatformMfaReadiness,
  platformGetCurrentPlatformActorProfile,
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
  platformPreviewPlatformCustomRoleRevision,
  platformRemoveCurrentPlatformMfaMethod,
  platformRetirePlatformCustomRole,
  platformRevokeCurrentPlatformSession,
  platformRevokeOtherCurrentPlatformSessions,
  platformRevokePlatformOperatorInvitation,
  type PlatformCustomRoleApplyRequest,
  type PlatformCustomRoleCopyRequest,
  type PlatformCustomRoleCreateRequest,
  type PlatformCustomRolePreviewOut,
  type PlatformCustomRolePreviewRequest,
  type PlatformCustomRoleRetireRequest,
  type PlatformCurrentActorProfileOut,
  type PlatformInvitationCreateRequest,
  type PlatformInvitationDetailOut,
  type PlatformInvitationOptionsOut,
  type PlatformInvitationRevokeRequest,
  type PlatformMfaMethodRemoveRequest,
  type PlatformMfaReadinessOut,
  type PlatformMfaTotpBeginRequest,
  type PlatformMfaTotpConfirmRequest,
  type PlatformMfaWebAuthnBeginRequest,
  type PlatformMfaWebAuthnCompleteRequest,
  type PlatformMfaWebAuthnRegistrationOut,
  type PlatformPermissionCatalogItemOut,
  type PlatformRoleAssignmentRequest,
  type PlatformRoleCatalogItemOut,
  type PlatformSessionInventoryItemOut,
  type PlatformSessionRevokeRequest,
  type PlatformSignInReadinessOut,
  type PlatformStepUpProofIssueRequest,
  type PlatformStepUpProofIssueResult,
  type PlatformStepUpWebAuthnCompleteRequest,
  type PlatformStepUpWebAuthnOptionsOut,
  type PlatformMutationReceipt,
  type PlatformTeamIdentityOut,
  type PlatformTeamQueueOut,
  type PlatformTotpSetup,
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
export const getCurrentPlatformActorProfile = async (): Promise<PlatformCurrentActorProfileOut> =>
  unwrap(await platformGetCurrentPlatformActorProfile({ client: platformApiClient }));
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

export const revokePlatformInvitation = async (
  invitationId: string,
  body: PlatformInvitationRevokeRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformRevokePlatformOperatorInvitation({
      body,
      client: platformApiClient,
      path: { invitation_id: invitationId },
    }),
  );

export const assignPlatformOperatorRoles = async (
  targetUserId: string,
  body: PlatformRoleAssignmentRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformAssignPlatformOperatorRoles({
      body,
      client: platformApiClient,
      path: { target_user_id: targetUserId },
    }),
  );

export const createPlatformCustomRole = async (
  body: PlatformCustomRoleCreateRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(await platformCreatePlatformCustomRole({ body, client: platformApiClient }));

export const copyPlatformCustomRole = async (
  body: PlatformCustomRoleCopyRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(await platformCopyPlatformCustomRole({ body, client: platformApiClient }));

export const previewPlatformCustomRoleRevision = async (
  roleId: string,
  body: PlatformCustomRolePreviewRequest,
): Promise<PlatformCustomRolePreviewOut> =>
  unwrap(
    await platformPreviewPlatformCustomRoleRevision({
      body,
      client: platformApiClient,
      path: { role_id: roleId },
    }),
  );

export const applyPlatformCustomRoleRevision = async (
  body: PlatformCustomRoleApplyRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(await platformApplyPlatformCustomRoleRevision({ body, client: platformApiClient }));

export const retirePlatformCustomRole = async (
  roleId: string,
  body: PlatformCustomRoleRetireRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformRetirePlatformCustomRole({
      body,
      client: platformApiClient,
      path: { role_id: roleId },
    }),
  );

export const beginPlatformStepUp = async (
  body: PlatformStepUpProofIssueRequest,
): Promise<PlatformStepUpWebAuthnOptionsOut> =>
  unwrap(await platformBeginPlatformStepUpWebauthn({ body, client: platformApiClient }));

export const completePlatformStepUp = async (
  body: PlatformStepUpWebAuthnCompleteRequest,
): Promise<PlatformStepUpProofIssueResult> =>
  unwrap(await platformCompletePlatformStepUpWebauthn({ body, client: platformApiClient }));

export const removeCurrentPlatformMfaMethod = async (
  methodId: string,
  body: PlatformMfaMethodRemoveRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformRemoveCurrentPlatformMfaMethod({
      body,
      client: platformApiClient,
      path: { method_id: methodId },
    }),
  );

export const beginCurrentPlatformTotpMethod = async (
  body: PlatformMfaTotpBeginRequest,
): Promise<PlatformTotpSetup> =>
  unwrap(await platformBeginCurrentPlatformTotpMethod({ body, client: platformApiClient }));

export const confirmCurrentPlatformTotpMethod = async (
  body: PlatformMfaTotpConfirmRequest,
): Promise<PlatformMfaReadinessOut> =>
  unwrap(await platformConfirmCurrentPlatformTotpMethod({ body, client: platformApiClient }));

export const beginCurrentPlatformWebauthnMethod = async (
  body: PlatformMfaWebAuthnBeginRequest,
): Promise<PlatformMfaWebAuthnRegistrationOut> =>
  unwrap(await platformBeginCurrentPlatformWebauthnMethod({ body, client: platformApiClient }));

export const completeCurrentPlatformWebauthnMethod = async (
  body: PlatformMfaWebAuthnCompleteRequest,
): Promise<PlatformMfaReadinessOut> =>
  unwrap(await platformCompleteCurrentPlatformWebauthnMethod({ body, client: platformApiClient }));
