import { api } from "@/lib/http";
import type {
  ConfirmMyEmailChangePayload,
  DeleteMyAccountCapability,
  DeleteMyAccountPayload,
  RegisterPayload,
  RequestMyEmailChangeOut,
  RequestMyEmailChangePayload,
  ResetTokenPayload,
  TokenPair,
  UpdateMyProfilePayload,
  UserProfile,
} from "@/types/api";

export async function login(payload: { identifier: string; password: string }): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login", payload, { auth: { skipRefresh: true } });
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
  identifier: string;
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
