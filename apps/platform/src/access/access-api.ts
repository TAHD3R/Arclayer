import {
  platformApplyPlatformCustomRoleRevision,
  platformBeginCurrentPlatformTotpMethod,
  platformBeginCurrentPlatformWebauthnMethod,
  platformBeginPlatformStepUpWebauthn,
  platformCompleteCurrentPlatformWebauthnMethod,
  platformCompletePlatformStepUpTotp,
  platformCompletePlatformStepUpWebauthn,
  platformConfirmCurrentPlatformTotpMethod,
  platformCopyPlatformCustomRole,
  platformCreatePlatformCustomRole,
  platformDeletePlatformSignInProvider,
  platformGetCurrentPlatformMfaReadiness,
  platformGetCurrentPlatformActorProfile,
  platformGetPlatformInvitationOptions,
  platformGetCurrentTeamIdentity,
  platformGetPlatformInvitation,
  platformGetPlatformSignInSettings,
  platformListCurrentPlatformSessions,
  platformListPlatformOperatorSessions,
  platformListPlatformInvitations,
  platformListPlatformPermissions,
  platformListPlatformRoles,
  platformListPlatformTeam,
  platformInvitePlatformOperator,
  platformOffboardPlatformOperator,
  platformPreviewPlatformCustomRoleRevision,
  platformReplacePlatformOperatorRoles,
  platformRemoveCurrentPlatformMfaMethod,
  platformRetirePlatformCustomRole,
  platformRevokeCurrentPlatformSession,
  platformRevokeOtherCurrentPlatformSessions,
  platformRevokePlatformOperatorInvitation,
  platformRevokePlatformOperatorSession,
  platformResetPlatformOperatorMfa,
  platformUpdatePlatformSignInPolicy,
  platformUpdatePlatformSignInProvider,
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
  type PlatformOperatorOffboardingRequest,
  type PlatformOperatorMfaResetRequest,
  type PlatformPermissionCatalogItemOut,
  type PlatformRoleAssignmentReplaceRequest,
  type PlatformRoleCatalogItemOut,
  type PlatformSessionInventoryItemOut,
  type PlatformSessionRevokeRequest,
  type PlatformSignInPolicyUpdateRequest,
  type PlatformSignInProviderDeleteRequest,
  type PlatformSignInProviderUpdateRequest,
  type PlatformSignInSettingsOut,
  type PlatformStepUpProofIssueRequest,
  type PlatformStepUpProofIssueResult,
  type PlatformStepUpTotpCompleteRequest,
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
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = errorCode(item);
      if (code) return code;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    error?: unknown;
    code?: unknown;
    detail?: unknown;
    message?: unknown;
  };
  return (
    errorCode(candidate.error) ??
    errorCode(candidate.code) ??
    errorCode(candidate.detail) ??
    errorCode(candidate.message)
  );
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
export const getSignInSettings = async (): Promise<PlatformSignInSettingsOut> =>
  unwrap(await platformGetPlatformSignInSettings({ client: platformApiClient }));
export const updateSignInPolicy = async (
  body: PlatformSignInPolicyUpdateRequest,
): Promise<PlatformSignInSettingsOut> =>
  unwrap(await platformUpdatePlatformSignInPolicy({ body, client: platformApiClient }));
export const updateSignInProvider = async (
  providerKey: string,
  body: PlatformSignInProviderUpdateRequest,
): Promise<PlatformSignInSettingsOut> =>
  unwrap(
    await platformUpdatePlatformSignInProvider({
      body,
      client: platformApiClient,
      path: { provider_key: providerKey },
    }),
  );
export const deleteSignInProvider = async (
  providerKey: string,
  body: PlatformSignInProviderDeleteRequest,
): Promise<PlatformSignInSettingsOut> =>
  unwrap(
    await platformDeletePlatformSignInProvider({
      body,
      client: platformApiClient,
      path: { provider_key: providerKey },
    }),
  );
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

export const offboardPlatformOperator = async (
  targetUserId: string,
  body: PlatformOperatorOffboardingRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformOffboardPlatformOperator({
      body,
      client: platformApiClient,
      path: { target_user_id: targetUserId },
    }),
  );

export const replacePlatformOperatorRoles = async (
  targetUserId: string,
  body: PlatformRoleAssignmentReplaceRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformReplacePlatformOperatorRoles({
      body,
      client: platformApiClient,
      path: { target_user_id: targetUserId },
    }),
  );

export const listPlatformOperatorSessions = async (
  operatorId: string,
): Promise<PlatformSessionInventoryItemOut[]> =>
  unwrap(
    await platformListPlatformOperatorSessions({
      client: platformApiClient,
      path: { operator_id: operatorId },
    }),
  );

export const revokePlatformOperatorSession = async (
  operatorId: string,
  sessionId: string,
  body: PlatformSessionRevokeRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformRevokePlatformOperatorSession({
      body,
      client: platformApiClient,
      path: { operator_id: operatorId, session_id: sessionId },
    }),
  );

export const resetPlatformOperatorMfa = async (
  operatorId: string,
  body: PlatformOperatorMfaResetRequest,
): Promise<PlatformMutationReceipt> =>
  unwrap(
    await platformResetPlatformOperatorMfa({
      body,
      client: platformApiClient,
      path: { operator_id: operatorId },
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

export const completePlatformTotpStepUp = async (
  body: PlatformStepUpTotpCompleteRequest,
): Promise<PlatformStepUpProofIssueResult> =>
  unwrap(await platformCompletePlatformStepUpTotp({ body, client: platformApiClient }));

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
