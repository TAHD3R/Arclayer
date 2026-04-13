import { api } from "@/lib/http";
import type {
  AuthSessionList,
  AuthSessionRevokeOthersResult,
  ConfirmMyEmailChangePayload,
  DeleteMyAccountCapability,
  DeleteMyAccountPayload,
  EmailCheckOut,
  LoginEmailCodeRequestOut,
  MySecurityCapability,
  RegisterPayload,
  RequestMyEmailChangeOut,
  RequestMyEmailChangePayload,
  ResetTokenPayload,
  SetMyPasswordPayload,
  TokenPair,
  TwoFactorBackupCodesResult,
  TwoFactorCapabilities,
  TwoFactorSetupResult,
  TwoFactorStatus,
  UpdateMyProfilePayload,
  UserProfile,
} from "@/types/api";

export async function emailCheck(payload: { email: string }): Promise<EmailCheckOut> {
  return api.post<EmailCheckOut>("/auth/email-check", payload, { auth: { skipRefresh: true } });
}

export async function login(payload: { email: string; password: string }): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login", payload, { auth: { skipRefresh: true } });
}

export async function requestLoginEmailCode(payload: {
  email: string;
}): Promise<LoginEmailCodeRequestOut> {
  return api.post<LoginEmailCodeRequestOut>("/auth/login/email-code/request", payload, {
    auth: { skipRefresh: true },
  });
}

export async function verifyLoginEmailCode(payload: {
  email: string;
  code: string;
}): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login/email-code/verify", payload, {
    auth: { skipRefresh: true },
  });
}

export async function loginTwoFactor(payload: {
  twoFactorToken: string;
  code?: string;
  backupCode?: string;
}): Promise<TokenPair> {
  return api.post<TokenPair>(
    "/auth/login/2fa",
    {
      two_factor_token: payload.twoFactorToken,
      ...(payload.code ? { code: payload.code } : {}),
      ...(payload.backupCode ? { backup_code: payload.backupCode } : {}),
    },
    { auth: { skipRefresh: true } },
  );
}

export async function register(payload: RegisterPayload): Promise<UserProfile> {
  return api.post<UserProfile>("/auth/register", payload, { auth: { skipRefresh: true } });
}

export async function refresh(payload: { refresh_token: string }): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/refresh", payload, { auth: { skipRefresh: true } });
}

export async function refreshCookie(): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/refresh-cookie", {}, { auth: { skipRefresh: true } });
}

export async function logout(payload?: { refreshToken?: string | null }): Promise<null> {
  return api.post<null>(
    "/auth/logout",
    payload?.refreshToken ? { refresh_token: payload.refreshToken } : {},
  );
}

export async function me(): Promise<UserProfile> {
  return api.get<UserProfile>("/auth/me");
}

export async function updateMyProfile(payload: UpdateMyProfilePayload): Promise<UserProfile> {
  return api.patch<UserProfile>("/auth/me", payload);
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

export async function getDeleteMyAccountCapabilities(): Promise<DeleteMyAccountCapability> {
  return api.get<DeleteMyAccountCapability>("/auth/me/delete-capabilities");
}

export async function deleteMyAccount(payload: DeleteMyAccountPayload): Promise<null> {
  return api.post<null>("/auth/me/delete", payload);
}

export async function changePassword(payload: {
  old_password: string;
  new_password: string;
}): Promise<null> {
  return api.post<null>("/auth/change-password", payload);
}

export async function forgotPassword(payload: {
  email: string;
}): Promise<ResetTokenPayload | null> {
  return api.post<ResetTokenPayload | null>("/auth/forgot-password", payload, {
    auth: { skipRefresh: true },
  });
}

export async function resetPassword(payload: {
  reset_token: string;
  new_password: string;
}): Promise<null> {
  return api.post<null>("/auth/reset-password", payload, { auth: { skipRefresh: true } });
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return api.get<TwoFactorStatus>("/auth/2fa");
}

export async function getTwoFactorCapabilities(): Promise<TwoFactorCapabilities> {
  return api.get<TwoFactorCapabilities>("/auth/2fa/capabilities");
}

export async function beginTwoFactorSetup(payload?: {
  password?: string;
}): Promise<TwoFactorSetupResult> {
  return api.post<TwoFactorSetupResult>("/auth/2fa/setup", payload ?? {});
}

export async function confirmTwoFactorSetup(payload: {
  code: string;
}): Promise<TwoFactorBackupCodesResult> {
  return api.post<TwoFactorBackupCodesResult>("/auth/2fa/confirm", payload);
}

export async function disableTwoFactor(payload: {
  code?: string;
  backupCode?: string;
}): Promise<null> {
  return api.post<null>("/auth/2fa/disable", {
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.backupCode ? { backup_code: payload.backupCode } : {}),
  });
}

export async function regenerateTwoFactorBackupCodes(payload: {
  code?: string;
  backupCode?: string;
}): Promise<TwoFactorBackupCodesResult> {
  return api.post<TwoFactorBackupCodesResult>("/auth/2fa/backup-codes/regenerate", {
    ...(payload.code ? { code: payload.code } : {}),
    ...(payload.backupCode ? { backup_code: payload.backupCode } : {}),
  });
}

export async function listMySessions(): Promise<AuthSessionList> {
  return api.get<AuthSessionList>("/auth/sessions");
}

export async function revokeMySession(sessionId: string): Promise<null> {
  return api.post<null>(`/auth/sessions/${sessionId}/revoke`);
}

export async function revokeOtherSessions(): Promise<AuthSessionRevokeOthersResult> {
  return api.post<AuthSessionRevokeOthersResult>("/auth/sessions/revoke-others");
}
