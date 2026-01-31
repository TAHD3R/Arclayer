import { api } from "@/lib/http";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type AdminUserStatus = "active" | "disabled" | "locked";

export type AdminUserSummary = {
  id: string;
  username: string;
  email: string | null;
  status: AdminUserStatus;
  displayName: string | null;
  avatarUrl: string | null;
  avatarAssetId: string | null;
  lastLoginAt: string | null;
};

export type AdminUserDetail = AdminUserSummary & {
  tokenVersion: number;
};

export type ListAdminUsersParams = {
  page?: number;
  size?: number;
  q?: string;
  status?: AdminUserStatus;
  roleCode?: string;
  ordering?: string;
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        qs.append(k, String(item));
      }
      continue;
    }
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listAdminUsers(
  params: ListAdminUsersParams = {},
): Promise<PageData<AdminUserSummary>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
    status: params.status,
    roleCode: params.roleCode,
    ordering: params.ordering,
  });
  return api.get<PageData<AdminUserSummary>>(`/admin/users${query}`);
}

export async function enableAdminUser(userId: string): Promise<AdminUserDetail> {
  return api.post<AdminUserDetail>(`/admin/users/${userId}/enable`);
}

export async function disableAdminUser(userId: string): Promise<AdminUserDetail> {
  return api.post<AdminUserDetail>(`/admin/users/${userId}/disable`);
}

export type PatchAdminUserPayload = {
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  avatarAssetId?: string | null;
};

export async function patchAdminUser(
  userId: string,
  payload: PatchAdminUserPayload,
): Promise<AdminUserDetail> {
  return api.patch<AdminUserDetail>(`/admin/users/${userId}`, payload);
}

export async function resetAdminUserPassword(
  userId: string,
  payload: { newPassword: string },
): Promise<null> {
  return api.post<null>(`/admin/users/${userId}/reset-password`, {
    newPassword: payload.newPassword,
  });
}
