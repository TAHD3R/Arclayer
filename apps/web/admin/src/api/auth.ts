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

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PageData<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
}

export interface MyOrganization {
  organization_id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  membership_id: string;
  membership_status: "active" | "invited" | "disabled";
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

export async function meOrgs(
  params: { page?: number; size?: number } = {},
): Promise<PageData<MyOrganization>> {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page ?? 1));
  qs.set("size", String(params.size ?? 200));
  const q = qs.toString();
  return api.get<PageData<MyOrganization>>(`/auth/me/orgs?${q}`);
}

export async function meAuthz(): Promise<AuthzSnapshot> {
  return api.get<AuthzSnapshot>("/auth/me/authz");
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
