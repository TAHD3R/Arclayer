import { api } from "@/lib/http";
import type { TokenPair, UserProfile, ResetTokenPayload, RegisterPayload } from "@/types/api";

export async function login(payload: { identifier: string; password: string }): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login", payload, { auth: { skipRefresh: true } });
}

export async function register(payload: RegisterPayload): Promise<UserProfile> {
  return api.post<UserProfile>("/auth/register", payload, { auth: { skipRefresh: true } });
}

export async function refresh(payload: { refresh_token: string }): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/refresh", payload, { auth: { skipRefresh: true } });
}

export async function me(): Promise<UserProfile> {
  return api.get<UserProfile>("/auth/me");
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
