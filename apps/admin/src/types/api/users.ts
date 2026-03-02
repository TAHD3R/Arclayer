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

export type PatchAdminUserPayload = {
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  avatarAssetId?: string | null;
};
