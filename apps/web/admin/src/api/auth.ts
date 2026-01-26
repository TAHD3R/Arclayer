import { api } from "@/lib/http";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer" | string;
  expires_in: number;
  refresh_expires_in: number;
}

export interface AuthzSnapshot {
  user_id: string;
  role_codes: string[];
  permission_codes: string[];
  is_superuser: boolean;
}

export interface ResetTokenPayload {
  reset_token: string;
  expires_in: number;
}

export const authApi = {
  login: (payload: { identifier: string; password: string }) =>
    api.post<TokenPair>("/auth/login", payload, { auth: { skipRefresh: true } }),

  refresh: (payload: { refresh_token: string }) =>
    api.post<TokenPair>("/auth/refresh", payload, { auth: { skipRefresh: true } }),

  meAuthz: () => api.get<AuthzSnapshot>("/auth/me/authz"),

  forgotPassword: (payload: { identifier: string }) =>
    api.post<ResetTokenPayload | null>("/auth/forgot-password", payload, {
      auth: { skipRefresh: true },
    }),

  resetPassword: (payload: { reset_token: string; new_password: string }) =>
    api.post<null>("/auth/reset-password", payload, { auth: { skipRefresh: true } }),
} as const;
