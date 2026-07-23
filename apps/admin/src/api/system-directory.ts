import { api, apiRequest } from "@/lib/http";
import type {
  SystemDirectoryProjectDetail,
  SystemDirectoryProjectPage,
  SystemDirectoryUserDetail,
  SystemDirectoryUserPage,
  SystemDirectoryWorkspaceDetail,
  SystemDirectoryWorkspacePage,
} from "@arclayer/openapi/admin-types";
import type { DirectoryProjectOperationsOut } from "@arclayer/openapi";
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
  isSuperAdmin?: boolean;
};

type ResetSystemDirectoryUserPasswordPayload = {
  newPassword: string;
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
  createdFrom?: string;
  createdTo?: string;
  lastLoginFrom?: string;
  lastLoginTo?: string;
  workspaceMemberOfId?: string;
  projectMemberOfId?: string;
  ownedWorkspaceId?: string;
  ownedProjectId?: string;
  kind?: string;
  isActive?: boolean;
  workspaceId?: string;
  isArchived?: boolean;
  ownerUserId?: string;
  planCode?: string;
  subscriptionStatus?: string;
  commerceRisk?: string;
  runtimeHealth?: string;
  domainState?: string;
  releaseState?: string;
  activityFrom?: string;
  activityTo?: string;
};

export type AccessRestrictionReasonCategory =
  | "policy_violation"
  | "security_risk"
  | "billing_issue"
  | "abuse_prevention"
  | "compliance_review"
  | "owner_request"
  | "other";

export type AccessRestrictionEnforcePayload = {
  expectedRevision: number;
  reasonCategory: AccessRestrictionReasonCategory;
  reasonCode: string;
  operatorNote: string;
  reviewAt?: string | null;
  expiresAt?: string | null;
};

export type AccessRestrictionLiftPayload = {
  expectedRevision: number;
  operatorNote: string;
};

export type SystemDirectoryProjectOperations = DirectoryProjectOperationsOut;

function idempotencyOptions(idempotencyKey: string) {
  return { headers: { "Idempotency-Key": idempotencyKey } };
}

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
  if (params.createdFrom?.trim()) query.set("created_from", params.createdFrom.trim());
  if (params.createdTo?.trim()) query.set("created_to", params.createdTo.trim());
  if (params.lastLoginFrom?.trim()) query.set("last_login_from", params.lastLoginFrom.trim());
  if (params.lastLoginTo?.trim()) query.set("last_login_to", params.lastLoginTo.trim());
  if (params.workspaceMemberOfId?.trim()) {
    query.set("workspace_member_of_id", params.workspaceMemberOfId.trim());
  }
  if (params.projectMemberOfId?.trim()) {
    query.set("project_member_of_id", params.projectMemberOfId.trim());
  }
  if (params.ownedWorkspaceId?.trim()) {
    query.set("owned_workspace_id", params.ownedWorkspaceId.trim());
  }
  if (params.ownedProjectId?.trim()) {
    query.set("owned_project_id", params.ownedProjectId.trim());
  }
  if (params.kind?.trim()) query.set("kind", params.kind.trim());
  if (typeof params.isActive === "boolean") {
    query.set("is_active", String(params.isActive));
  }
  if (params.workspaceId?.trim()) query.set("workspace_id", params.workspaceId.trim());
  if (params.ownerUserId?.trim()) query.set("owner_user_id", params.ownerUserId.trim());
  if (params.planCode?.trim()) query.set("plan_code", params.planCode.trim());
  if (params.subscriptionStatus?.trim()) {
    query.set("subscription_status", params.subscriptionStatus.trim());
  }
  if (params.commerceRisk?.trim()) query.set("commerce_risk", params.commerceRisk.trim());
  if (params.runtimeHealth?.trim()) query.set("runtime_health", params.runtimeHealth.trim());
  if (params.domainState?.trim()) query.set("domain_state", params.domainState.trim());
  if (params.releaseState?.trim()) query.set("release_state", params.releaseState.trim());
  if (params.activityFrom?.trim()) query.set("activity_from", params.activityFrom.trim());
  if (params.activityTo?.trim()) query.set("activity_to", params.activityTo.trim());
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
  payload: AccessRestrictionEnforcePayload,
  idempotencyKey: string,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(
    `/system/directory/users/${userId}/disable`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export async function enableSystemDirectoryUser(
  userId: string,
  payload: AccessRestrictionLiftPayload,
  idempotencyKey: string,
): Promise<SystemDirectoryUserDetail> {
  return api.post<SystemDirectoryUserDetail>(
    `/system/directory/users/${userId}/enable`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export async function deleteSystemDirectoryUser(userId: string): Promise<void> {
  await api.delete<unknown>(`/system/directory/users/${userId}`);
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
  payload: AccessRestrictionEnforcePayload,
  idempotencyKey: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/archive`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export async function restoreSystemDirectoryWorkspace(
  workspaceId: string,
  payload: AccessRestrictionLiftPayload,
  idempotencyKey: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/restore`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export async function disableSystemDirectoryWorkspace(
  workspaceId: string,
  payload: AccessRestrictionEnforcePayload,
  idempotencyKey: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/disable`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export async function enableSystemDirectoryWorkspace(
  workspaceId: string,
  payload: AccessRestrictionLiftPayload,
  idempotencyKey: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.post<SystemDirectoryWorkspaceDetail>(
    `/system/directory/workspaces/${workspaceId}/enable`,
    payload,
    idempotencyOptions(idempotencyKey),
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

export async function getSystemDirectoryProjectOperations(
  projectId: string,
  previewSize = 6,
  signal?: AbortSignal,
): Promise<SystemDirectoryProjectOperations> {
  return api.get<SystemDirectoryProjectOperations>(
    `/system/directory/projects/${encodeURIComponent(projectId)}/operations?previewSize=${previewSize}`,
    { signal },
  );
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
  payload: AccessRestrictionEnforcePayload,
  idempotencyKey: string,
): Promise<SystemDirectoryProjectDetail> {
  return api.post<SystemDirectoryProjectDetail>(
    `/system/directory/projects/${projectId}/disable`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
}

export async function enableSystemDirectoryProject(
  projectId: string,
  payload: AccessRestrictionLiftPayload,
  idempotencyKey: string,
): Promise<SystemDirectoryProjectDetail> {
  return api.post<SystemDirectoryProjectDetail>(
    `/system/directory/projects/${projectId}/enable`,
    payload,
    idempotencyOptions(idempotencyKey),
  );
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
