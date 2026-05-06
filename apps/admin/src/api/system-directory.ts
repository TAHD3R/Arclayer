import { api, apiRequest } from "@/lib/http";
import type {
  DirectoryActorSummary,
  SystemDirectoryOrganizationDetail,
  SystemDirectoryOrganizationPage,
  SystemDirectoryProjectDetail,
  SystemDirectoryProjectPage,
  SystemDirectoryUserDetail,
  SystemDirectoryUserPage,
  SystemDirectoryWorkspaceDetail,
  SystemDirectoryWorkspacePage,
} from "@arclayer/openapi/admin-types";
import type {
  UploadAbortOut,
  UploadCompleteOut,
  UploadInitOut,
  UploadInitRequest,
  UploadPartCommitRequest,
  UploadPartPresignOut,
  UploadStatusOut,
} from "@arclayer/openapi/admin-types";

type UpdateSystemDirectoryUserPayload = {
  email?: string | null;
  displayName?: string | null;
  avatarAssetId?: string | null;
};

type ResetSystemDirectoryUserPasswordPayload = {
  newPassword: string;
};

type UpdateSystemDirectoryOrganizationPayload = {
  name?: string | null;
  slug?: string | null;
  ownerUserId?: string | null;
};

type UpdateSystemDirectoryWorkspacePayload = {
  name?: string | null;
  description?: string | null;
  iconMode?: "initials" | "glyph" | "emoji" | "image" | null;
  iconColor?: string | null;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
};

type UpdateSystemDirectoryProjectPayload = {
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  iconMode?: "initials" | "glyph" | "emoji" | "image" | null;
  iconColor?: string | null;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
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
  kind?: string;
  isActive?: boolean;
  organizationId?: string;
  workspaceId?: string;
  isArchived?: boolean;
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
  if (params.kind?.trim()) query.set("kind", params.kind.trim());
  if (typeof params.isActive === "boolean") {
    query.set("is_active", String(params.isActive));
  }
  if (params.organizationId?.trim()) query.set("organization_id", params.organizationId.trim());
  if (params.workspaceId?.trim()) query.set("workspace_id", params.workspaceId.trim());
  if (typeof params.isArchived === "boolean") {
    query.set("is_archived", String(params.isArchived));
  }
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

export async function listSystemDirectoryOrganizationOwnerCandidates(
  organizationId: string,
  params: Pick<SystemDirectoryListParams, "q" | "page" | "size"> = {},
): Promise<DirectoryActorSummary[]> {
  return api.get<DirectoryActorSummary[]>(
    `/system/directory/organizations/${organizationId}/owner-candidates${buildQuery(params)}`,
  );
}

export async function updateSystemDirectoryOrganization(
  organizationId: string,
  payload: UpdateSystemDirectoryOrganizationPayload,
): Promise<SystemDirectoryOrganizationDetail> {
  return api.patch<SystemDirectoryOrganizationDetail>(
    `/system/directory/organizations/${organizationId}`,
    {
      name: payload.name,
      slug: payload.slug,
      ownerUserId: payload.ownerUserId,
    },
  );
}

export async function disableSystemDirectoryOrganization(
  organizationId: string,
): Promise<SystemDirectoryOrganizationDetail> {
  return api.post<SystemDirectoryOrganizationDetail>(
    `/system/directory/organizations/${organizationId}/disable`,
  );
}

export async function enableSystemDirectoryOrganization(
  organizationId: string,
): Promise<SystemDirectoryOrganizationDetail> {
  return api.post<SystemDirectoryOrganizationDetail>(
    `/system/directory/organizations/${organizationId}/enable`,
  );
}

export async function deleteSystemDirectoryOrganization(
  organizationId: string,
  payload: { confirmName: string },
): Promise<void> {
  await apiRequest<unknown>(`/system/directory/organizations/${organizationId}`, {
    method: "DELETE",
    body: payload,
  });
}

export async function getSystemDirectoryWorkspaceDetail(
  workspaceId: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.get<SystemDirectoryWorkspaceDetail>(`/system/directory/workspaces/${workspaceId}`);
}

export async function updateSystemDirectoryWorkspace(
  workspaceId: string,
  payload: UpdateSystemDirectoryWorkspacePayload,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.patch<SystemDirectoryWorkspaceDetail>(`/system/directory/workspaces/${workspaceId}`, {
    name: payload.name,
    description: payload.description,
    iconMode: payload.iconMode,
    iconColor: payload.iconColor,
    iconGlyph: payload.iconGlyph,
    iconEmoji: payload.iconEmoji,
    iconUrl: payload.iconUrl,
  });
}

export async function archiveSystemDirectoryWorkspace(
  workspaceId: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/archive`,
  );
}

export async function restoreSystemDirectoryWorkspace(
  workspaceId: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/restore`,
  );
}

export async function disableSystemDirectoryWorkspace(
  workspaceId: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/disable`,
  );
}

export async function enableSystemDirectoryWorkspace(
  workspaceId: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/enable`,
  );
}

export async function deleteSystemDirectoryWorkspace(
  workspaceId: string,
  payload: { confirmName: string },
): Promise<void> {
  await apiRequest<unknown>(`/system/directory/workspaces/${workspaceId}`, {
    method: "DELETE",
    body: payload,
  });
}

export async function getSystemDirectoryProjectDetail(
  projectId: string,
): Promise<SystemDirectoryProjectDetail> {
  return api.get<SystemDirectoryProjectDetail>(`/system/directory/projects/${projectId}`);
}

export async function updateSystemDirectoryProject(
  projectId: string,
  payload: UpdateSystemDirectoryProjectPayload,
): Promise<SystemDirectoryProjectDetail> {
  return api.patch<SystemDirectoryProjectDetail>(`/system/directory/projects/${projectId}`, {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
    iconMode: payload.iconMode,
    iconColor: payload.iconColor,
    iconGlyph: payload.iconGlyph,
    iconEmoji: payload.iconEmoji,
    iconUrl: payload.iconUrl,
  });
}

export async function disableSystemDirectoryProject(
  projectId: string,
): Promise<SystemDirectoryProjectDetail> {
  return api.post<SystemDirectoryProjectDetail>(`/system/directory/projects/${projectId}/disable`);
}

export async function enableSystemDirectoryProject(
  projectId: string,
): Promise<SystemDirectoryProjectDetail> {
  return api.post<SystemDirectoryProjectDetail>(`/system/directory/projects/${projectId}/enable`);
}

export async function deleteSystemDirectoryProject(
  projectId: string,
  payload: { confirmName: string },
): Promise<void> {
  await apiRequest<unknown>(`/system/directory/projects/${projectId}`, {
    method: "DELETE",
    body: payload,
  });
}
