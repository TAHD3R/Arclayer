import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";

import type {
  AdminUserDetail,
  AdminUserSummary,
  ListAdminUsersParams,
  PageData,
  PatchAdminUserPayload,
} from "@/types/api";

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
