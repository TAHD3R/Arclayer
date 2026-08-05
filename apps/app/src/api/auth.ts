import { api } from "@/lib/http";
import type {
  AuthSessionListOut,
  AuthSessionOut,
  AuthSessionRevokeOthersOut,
  ChangePasswordRequest,
  ConfirmMyEmailChangeRequest as ConfirmMyEmailChangePayload,
  DeleteMyAccountCapabilityOut as DeleteMyAccountCapability,
  DeleteMyAccountRequest as DeleteMyAccountPayload,
  EmailCheckOut,
  ConfirmRemoveMyPasswordRequest as ConfirmRemoveMyPasswordPayload,
  LoginEmailCodeRequest,
  LoginEmailCodeRequestOut,
  LoginEmailCodeVerifyRequest,
  LoginRequest,
  LogoutRequest,
  MySecurityCapabilityOut as MySecurityCapability,
  OnboardingProfileOut as OnboardingProfile,
  OnboardingProfilePatchRequest as PatchOnboardingProfilePayload,
  RefreshRequest,
  RegisterEmailResendRequest,
  RequestRemoveMyPasswordRequest as RequestRemoveMyPasswordPayload,
  RequestRemoveMyPasswordOut,
  RegisterRequest as RegisterPayload,
  RegisterResult,
  RegisterEmailVerificationOut,
  RequestMyEmailChangeOut,
  RequestMyEmailChangeRequest as RequestMyEmailChangePayload,
  ResetPasswordRequest,
  ResetTokenPayload,
  SecurityVerificationProofOut,
  SecurityVerificationTotpRequest,
  SecurityVerificationWebAuthnBeginOut,
  SecurityVerificationWebAuthnBeginRequest,
  SecurityVerificationWebAuthnCompleteRequest,
  SetMyPasswordRequest as SetMyPasswordPayload,
  TokenPair,
  TwoFactorConfirmOut as TwoFactorBackupCodesResult,
  TwoFactorConfirmRequest,
  TwoFactorCapabilitiesOut as TwoFactorCapabilities,
  TwoFactorDisableRequest,
  TwoFactorLoginRequest,
  TwoFactorRegenerateBackupCodesRequest,
  TwoFactorSetupOut as TwoFactorSetupResult,
  TwoFactorSetupRequest,
  TwoFactorStatusOut as TwoFactorStatus,
  UpdateMyProfileRequest as UpdateMyProfilePayload,
  UsernameCheckOut,
  UserProfile,
  WebAuthnAuthenticationBeginOut,
  WebAuthnCredentialDeleteRequest,
  WebAuthnCredentialListOut,
  WebAuthnCredentialOut,
  WebAuthnLoginBeginRequest,
  WebAuthnLoginCompleteRequest,
  WebAuthnRegistrationBeginOut,
  WebAuthnRegistrationBeginRequest,
  WebAuthnRegistrationCompleteRequest,
} from "@arclayer/openapi";

export type SecurityAction = SecurityVerificationTotpRequest["action"];

type AuthSessionList = Omit<AuthSessionListOut, "items" | "total"> & {
  items: AuthSessionOut[];
  total: number;
};
type AuthSessionRevokeOthersResult = Omit<AuthSessionRevokeOthersOut, "revokedCount"> & {
  revokedCount: number;
};

function requireAuthSessionList(response: AuthSessionListOut): AuthSessionList {
  if (!Array.isArray(response.items) || typeof response.total !== "number") {
    throw new Error("Invalid auth session list response");
  }
  return { ...response, items: response.items, total: response.total };
}

function requireAuthSessionRevokeResult(
  response: AuthSessionRevokeOthersOut,
): AuthSessionRevokeOthersResult {
  if (typeof response.revokedCount !== "number") {
    throw new Error("Invalid auth session revoke response");
  }
  return { ...response, revokedCount: response.revokedCount };
}

export async function emailCheck(payload: { email: string }): Promise<EmailCheckOut> {
  return api.post<EmailCheckOut>("/auth/email-check", payload, { auth: { skipRefresh: true } });
}

export async function usernameCheck(payload: { username: string }): Promise<UsernameCheckOut> {
  return api.post<UsernameCheckOut>("/auth/username-check", payload, {
    auth: { skipRefresh: true },
  });
}

export async function login(payload: LoginRequest): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login", payload, { auth: { skipRefresh: true } });
}

export async function requestLoginEmailCode(
  payload: LoginEmailCodeRequest,
): Promise<LoginEmailCodeRequestOut> {
  return api.post<LoginEmailCodeRequestOut>("/auth/login/email-code/request", payload, {
    auth: { skipRefresh: true },
  });
}

export async function verifyLoginEmailCode(
  payload: LoginEmailCodeVerifyRequest,
): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login/email-code/verify", payload, {
    auth: { skipRefresh: true },
  });
}

export async function loginTwoFactor(payload: TwoFactorLoginRequest): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login/2fa", payload, { auth: { skipRefresh: true } });
}

export async function beginLoginTwoFactorWebAuthn(
  payload: WebAuthnLoginBeginRequest,
): Promise<WebAuthnAuthenticationBeginOut> {
  return api.post<WebAuthnAuthenticationBeginOut>("/auth/login/2fa/webauthn/options", payload, {
    auth: { skipRefresh: true },
  });
}

export async function completeLoginTwoFactorWebAuthn(
  payload: WebAuthnLoginCompleteRequest,
): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login/2fa/webauthn/complete", payload, {
    auth: { skipRefresh: true },
  });
}

export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  return api.post<RegisterResult>("/auth/register", payload, { auth: { skipRefresh: true } });
}

export async function resendRegistrationEmailVerification(
  payload: RegisterEmailResendRequest,
): Promise<RegisterResult> {
  return api.post<RegisterResult>("/auth/register/email/resend", payload, {
    auth: { skipRefresh: true },
  });
}

export async function confirmRegistrationEmailVerification(payload: {
  token: string;
}): Promise<RegisterEmailVerificationOut> {
  return api.post<RegisterEmailVerificationOut>("/auth/register/email/confirm", payload, {
    auth: { skipRefresh: true },
  });
}

export async function refresh(payload: RefreshRequest): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/refresh", payload, { auth: { skipRefresh: true } });
}

export async function refreshCookie(): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/refresh-cookie", {}, { auth: { skipRefresh: true } });
}

export async function logout(payload?: { refreshToken?: string | null }): Promise<null> {
  const body: LogoutRequest = { refreshToken: payload?.refreshToken };
  return api.post<null>("/auth/logout", body);
}

export async function me(): Promise<UserProfile> {
  return api.get<UserProfile>("/auth/me");
}

export async function updateMyProfile(payload: UpdateMyProfilePayload): Promise<UserProfile> {
  return api.patch<UserProfile>("/auth/me", payload);
}

export async function getMyOnboardingProfile(): Promise<OnboardingProfile> {
  return api.get<OnboardingProfile>("/auth/me/onboarding-profile");
}

export async function patchMyOnboardingProfile(
  payload: PatchOnboardingProfilePayload,
): Promise<OnboardingProfile> {
  return api.patch<OnboardingProfile>("/auth/me/onboarding-profile", payload);
}

export async function requestMyEmailChange(
  payload: RequestMyEmailChangePayload,
): Promise<RequestMyEmailChangeOut> {
  return api.post<RequestMyEmailChangeOut>("/auth/me/email/request", payload);
}

export async function confirmMyEmailChange(
  payload: ConfirmMyEmailChangePayload,
): Promise<UserProfile> {
  return api.post<UserProfile>("/auth/me/email/confirm", payload);
}

export async function getMySecurityCapabilities(): Promise<MySecurityCapability> {
  return api.get<MySecurityCapability>("/auth/me/security-capabilities");
}

export async function setMyPassword(payload: SetMyPasswordPayload): Promise<null> {
  return api.post<null>("/auth/me/set-password", payload);
}

export async function requestRemoveMyPassword(
  payload: RequestRemoveMyPasswordPayload,
): Promise<RequestRemoveMyPasswordOut> {
  return api.post<RequestRemoveMyPasswordOut>("/auth/me/remove-password/request", payload);
}

export async function confirmRemoveMyPassword(
  payload: ConfirmRemoveMyPasswordPayload,
): Promise<null> {
  return api.post<null>("/auth/me/remove-password/confirm", payload);
}

export async function getDeleteMyAccountCapabilities(): Promise<DeleteMyAccountCapability> {
  return api.get<DeleteMyAccountCapability>("/auth/me/delete-capabilities");
}

export async function deleteMyAccount(payload: DeleteMyAccountPayload): Promise<null> {
  return api.post<null>("/auth/me/delete", payload);
}

export async function changePassword(payload: ChangePasswordRequest): Promise<null> {
  return api.post<null>("/auth/change-password", payload);
}

export async function forgotPassword(payload: {
  email: string;
}): Promise<ResetTokenPayload | null> {
  return api.post<ResetTokenPayload | null>("/auth/forgot-password", payload, {
    auth: { skipRefresh: true },
  });
}

export async function resetPassword(payload: ResetPasswordRequest): Promise<null> {
  return api.post<null>("/auth/reset-password", payload, { auth: { skipRefresh: true } });
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return api.get<TwoFactorStatus>("/auth/2fa");
}

export async function listTwoFactorWebAuthnCredentials(): Promise<WebAuthnCredentialListOut> {
  return api.get<WebAuthnCredentialListOut>("/auth/2fa/webauthn");
}

export async function beginTwoFactorWebAuthnRegistration(
  payload: WebAuthnRegistrationBeginRequest,
): Promise<WebAuthnRegistrationBeginOut> {
  return api.post<WebAuthnRegistrationBeginOut>("/auth/2fa/webauthn/registration/options", payload);
}

export async function completeTwoFactorWebAuthnRegistration(
  payload: WebAuthnRegistrationCompleteRequest,
): Promise<WebAuthnCredentialOut> {
  return api.post<WebAuthnCredentialOut>("/auth/2fa/webauthn/registration/complete", payload);
}

export async function removeTwoFactorWebAuthnCredential(
  credentialId: string,
  payload: WebAuthnCredentialDeleteRequest,
): Promise<null> {
  return api.post<null>(`/auth/2fa/webauthn/${encodeURIComponent(credentialId)}/remove`, payload);
}

export async function verifySecurityActionTotp(
  payload: SecurityVerificationTotpRequest,
): Promise<SecurityVerificationProofOut> {
  return api.post<SecurityVerificationProofOut>("/auth/me/security-verification/totp", payload);
}

export async function beginSecurityActionWebAuthn(
  payload: SecurityVerificationWebAuthnBeginRequest,
): Promise<SecurityVerificationWebAuthnBeginOut> {
  return api.post<SecurityVerificationWebAuthnBeginOut>(
    "/auth/me/security-verification/webauthn/options",
    payload,
  );
}

export async function completeSecurityActionWebAuthn(
  payload: SecurityVerificationWebAuthnCompleteRequest,
): Promise<SecurityVerificationProofOut> {
  return api.post<SecurityVerificationProofOut>(
    "/auth/me/security-verification/webauthn/complete",
    payload,
  );
}

export async function getTwoFactorCapabilities(): Promise<TwoFactorCapabilities> {
  return api.get<TwoFactorCapabilities>("/auth/2fa/capabilities");
}

export async function beginTwoFactorSetup(
  payload?: TwoFactorSetupRequest,
): Promise<TwoFactorSetupResult> {
  return api.post<TwoFactorSetupResult>("/auth/2fa/setup", payload ?? {});
}

export async function confirmTwoFactorSetup(
  payload: TwoFactorConfirmRequest,
): Promise<TwoFactorBackupCodesResult> {
  return api.post<TwoFactorBackupCodesResult>("/auth/2fa/confirm", payload);
}

export async function disableTwoFactor(payload: TwoFactorDisableRequest): Promise<null> {
  return api.post<null>("/auth/2fa/disable", payload);
}

export async function regenerateTwoFactorBackupCodes(
  payload: TwoFactorRegenerateBackupCodesRequest,
): Promise<TwoFactorBackupCodesResult> {
  return api.post<TwoFactorBackupCodesResult>("/auth/2fa/backup-codes/regenerate", payload);
}

export async function listMySessions(): Promise<AuthSessionList> {
  const sessions = await api.get<AuthSessionListOut>("/auth/sessions");
  return requireAuthSessionList(sessions);
}

export async function revokeMySession(sessionId: string): Promise<null> {
  return api.post<null>(`/auth/sessions/${sessionId}/revoke`);
}

export async function revokeOtherSessions(): Promise<AuthSessionRevokeOthersResult> {
  const result = await api.post<AuthSessionRevokeOthersOut>("/auth/sessions/revoke-others");
  return requireAuthSessionRevokeResult(result);
}
