import { api, apiRequest } from "@/lib/http";
import type {
  SystemDirectoryOrganizationDetail,
  SystemDirectoryOrganizationPage,
  SystemDirectoryProjectDetail,
  SystemDirectoryProjectPage,
  SystemDirectoryUserDetail,
  SystemDirectoryUserPage,
  SystemDirectoryWorkspaceDetail,
  SystemDirectoryWorkspacePage,
} from "@/types/api/system-directory";
import type {
  UploadAbortOut,
  UploadCompleteOut,
  UploadInitOut,
  UploadInitRequest,
  UploadPartCommitRequest,
  UploadPartPresignOut,
  UploadStatusOut,
} from "@/types/api/uploads";

type UpdateSystemDirectoryUserPayload = {
  email?: string | null;
  displayName?: string | null;
  avatarAssetId?: string | null;
};

type ResetSystemDirectoryUserPasswordPayload = {
  newPassword: string;
};

type SystemDirectoryListParams = {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  status?: string;
  isSuperAdmin?: boolean;
  hasPassword?: boolean;
  twoFactorEnabled?: boolean;
  oauthProvider?: string;
};

function userAvatarUploadPath(userId: string, path: string) {
  return `/system/directory/users/${encodeURIComponent(userId)}/avatar${path}`;
}

function buildQuery(params: SystemDirectoryListParams) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.size) query.set("size", String(params.size));
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.ordering?.trim()) query.set("ordering", params.ordering.trim());
  if (params.status?.trim()) query.set("status", params.status.trim());
  if (typeof params.isSuperAdmin === "boolean") {
    query.set("is_super_admin", String(params.isSuperAdmin));
  }
  if (typeof params.hasPassword === "boolean") {
    query.set("has_password", String(params.hasPassword));
  }
  if (typeof params.twoFactorEnabled === "boolean") {
    query.set("two_factor_enabled", String(params.twoFactorEnabled));
  }
  if (params.oauthProvider?.trim()) query.set("oauth_provider", params.oauthProvider.trim());
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listSystemDirectoryUsers(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryUserPage> {
  return api.get<SystemDirectoryUserPage>(`/system/directory/users${buildQuery(params)}`);
}

export async function listSystemDirectoryOrganizations(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryOrganizationPage> {
  return api.get<SystemDirectoryOrganizationPage>(
    `/system/directory/organizations${buildQuery(params)}`,
  );
}

export async function listSystemDirectoryWorkspaces(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryWorkspacePage> {
  return api.get<SystemDirectoryWorkspacePage>(`/system/directory/workspaces${buildQuery(params)}`);
}

export async function listSystemDirectoryProjects(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryProjectPage> {
  return api.get<SystemDirectoryProjectPage>(`/system/directory/projects${buildQuery(params)}`);
}

export async function getSystemDirectoryUserDetail(
  userId: string,
): Promise<SystemDirectoryUserDetail> {
  return api.get<SystemDirectoryUserDetail>(`/system/directory/users/${userId}`);
}

export async function updateSystemDirectoryUser(
  userId: string,
  payload: UpdateSystemDirectoryUserPayload,
): Promise<SystemDirectoryUserDetail> {
  return api.patch<SystemDirectoryUserDetail>(`/system/directory/users/${userId}`, payload);
}

export async function initSystemDirectoryUserAvatarUpload(
  userId: string,
  payload: UploadInitRequest,
): Promise<UploadInitOut> {
  return api.post<UploadInitOut>(userAvatarUploadPath(userId, "/uploads/init"), payload);
}

export async function getSystemDirectoryUserAvatarUploadStatus(
  userId: string,
  uploadId: string,
): Promise<UploadStatusOut> {
  return api.get<UploadStatusOut>(
    userAvatarUploadPath(userId, `/uploads/${encodeURIComponent(uploadId)}`),
  );
}

export async function uploadSystemDirectoryUserAvatarPart(params: {
  userId: string;
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  await apiRequest<unknown>(
    userAvatarUploadPath(
      params.userId,
      `/uploads/${encodeURIComponent(params.uploadId)}/parts/${params.partNumber}`,
    ),
    {
      method: "PUT",
      body: params.chunk,
      signal: params.signal,
    },
  );
}

export async function presignSystemDirectoryUserAvatarUploadPart(params: {
  userId: string;
  uploadId: string;
  partNumber: number;
}): Promise<UploadPartPresignOut> {
  return api.post<UploadPartPresignOut>(
    userAvatarUploadPath(
      params.userId,
      `/uploads/${encodeURIComponent(params.uploadId)}/parts/${params.partNumber}/presign`,
    ),
  );
}

export async function commitSystemDirectoryUserAvatarUploadPart(params: {
  userId: string;
  uploadId: string;
  partNumber: number;
  payload: UploadPartCommitRequest;
}): Promise<void> {
  await api.post<unknown>(
    userAvatarUploadPath(
      params.userId,
      `/uploads/${encodeURIComponent(params.uploadId)}/parts/${params.partNumber}/commit`,
    ),
    params.payload,
  );
}

export async function completeSystemDirectoryUserAvatarUpload(
  userId: string,
  uploadId: string,
): Promise<UploadCompleteOut> {
  return api.post<UploadCompleteOut>(
    userAvatarUploadPath(userId, `/uploads/${encodeURIComponent(uploadId)}/complete`),
  );
}

export async function abortSystemDirectoryUserAvatarUpload(
  userId: string,
  uploadId: string,
): Promise<UploadAbortOut> {
  return api.post<UploadAbortOut>(
    userAvatarUploadPath(userId, `/uploads/${encodeURIComponent(uploadId)}/abort`),
  );
}

export async function resetSystemDirectoryUserPassword(
  userId: string,
  payload: ResetSystemDirectoryUserPasswordPayload,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(`/system/directory/users/${userId}/reset-password`, {
    newPassword: payload.newPassword,
  });
}

export async function sendSystemDirectoryUserResetPasswordEmail(
  userId: string,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(
    `/system/directory/users/${userId}/send-reset-password-email`,
  );
}

export async function revokeSystemDirectoryUserSessions(
  userId: string,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(`/system/directory/users/${userId}/revoke-sessions`);
}

export async function disableSystemDirectoryUserTwoFactor(
  userId: string,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(
    `/system/directory/users/${userId}/disable-two-factor`,
  );
}

export async function unlinkSystemDirectoryUserOAuthIdentity(
  userId: string,
  provider: string,
): Promise<SystemDirectoryUserDetail> {
  return api.delete<SystemDirectoryUserDetail>(
    `/system/directory/users/${userId}/oauth-identities/${encodeURIComponent(provider)}`,
  );
}

export async function disableSystemDirectoryUser(
  userId: string,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(`/system/directory/users/${userId}/disable`);
}

export async function enableSystemDirectoryUser(
  userId: string,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(`/system/directory/users/${userId}/enable`);
}

export async function deleteSystemDirectoryUser(userId: string): Promise<void> {
  await api.delete<unknown>(`/system/directory/users/${userId}`);
}

export async function getSystemDirectoryOrganizationDetail(
  organizationId: string,
): Promise<SystemDirectoryOrganizationDetail> {
  return api.get<SystemDirectoryOrganizationDetail>(
    `/system/directory/organizations/${organizationId}`,
  );
}

export async function getSystemDirectoryWorkspaceDetail(
  workspaceId: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.get<SystemDirectoryWorkspaceDetail>(`/system/directory/workspaces/${workspaceId}`);
}

export async function getSystemDirectoryProjectDetail(
  projectId: string,
): Promise<SystemDirectoryProjectDetail> {
  return api.get<SystemDirectoryProjectDetail>(`/system/directory/projects/${projectId}`);
}
