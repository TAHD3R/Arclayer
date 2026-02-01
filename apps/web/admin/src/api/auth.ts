import { api } from "@/lib/http";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer" | string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ResetTokenPayload {
  reset_token: string;
  expires_in: number;
}

export async function login(payload: { identifier: string; password: string }): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login", payload, { auth: { skipRefresh: true } });
}

export async function refresh(payload: { refresh_token: string }): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/refresh", payload, { auth: { skipRefresh: true } });
}

export async function me(): Promise<UserProfile> {
  return api.get<UserProfile>("/auth/me");
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
