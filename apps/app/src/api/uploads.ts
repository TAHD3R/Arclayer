import { api, apiRequest } from "@/lib/http";
import { projectPath, workspacePath } from "@/lib/api";
import type {
  UploadInitRequest,
  UploadInitOut,
  UploadStatusOut,
  UploadCompleteOut,
  UploadAbortOut,
  UploadPartPresignOut,
  UploadPartCommitRequest,
  AvatarUploadInitRequest,
  UploadPolicyOut,
} from "@arclayer/openapi";

export async function initUpload(
  projectId: string,
  payload: UploadInitRequest,
): Promise<UploadInitOut> {
  return api.post<UploadInitOut>(projectPath(projectId, "/uploads/init"), payload);
}

export async function getUploadPolicy(
  projectId: string,
  purpose = "library",
): Promise<UploadPolicyOut> {
  const params = new URLSearchParams({ purpose });
  return api.get<UploadPolicyOut>(projectPath(projectId, `/uploads/policy?${params.toString()}`));
}

export async function getUploadStatus(
  projectId: string,
  uploadId: string,
): Promise<UploadStatusOut> {
  return api.get<UploadStatusOut>(projectPath(projectId, `/uploads/${uploadId}`));
}

export async function uploadPart(params: {
  projectId: string;
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  // This endpoint expects raw bytes, not JSON.
  await apiRequest<unknown>(
    projectPath(params.projectId, `/uploads/${params.uploadId}/parts/${params.partNumber}`),
    {
      method: "PUT",
      body: params.chunk,
      signal: params.signal,
    },
  );
}

export async function presignUploadPart(params: {
  projectId: string;
  uploadId: string;
  partNumber: number;
}): Promise<UploadPartPresignOut> {
  return api.post<UploadPartPresignOut>(
    projectPath(params.projectId, `/uploads/${params.uploadId}/parts/${params.partNumber}/presign`),
  );
}

export async function commitUploadPart(params: {
  projectId: string;
  uploadId: string;
  partNumber: number;
  payload: UploadPartCommitRequest;
}): Promise<void> {
  await api.post<unknown>(
    projectPath(params.projectId, `/uploads/${params.uploadId}/parts/${params.partNumber}/commit`),
    params.payload,
  );
}

export async function completeUpload(
  projectId: string,
  uploadId: string,
): Promise<UploadCompleteOut> {
  return api.post<UploadCompleteOut>(projectPath(projectId, `/uploads/${uploadId}/complete`));
}

export async function abortUpload(projectId: string, uploadId: string): Promise<UploadAbortOut> {
  return api.post<UploadAbortOut>(projectPath(projectId, `/uploads/${uploadId}/abort`));
}

// ---------------------------------------------------------------------------
// Workspace-scoped uploads
// ---------------------------------------------------------------------------

export async function initWorkspaceUpload(
  workspaceId: string,
  payload: UploadInitRequest,
): Promise<UploadInitOut> {
  return api.post<UploadInitOut>(workspacePath(workspaceId, "/uploads/init"), payload);
}

export async function getWorkspaceUploadPolicy(
  workspaceId: string,
  purpose = "workspace_icon",
): Promise<UploadPolicyOut> {
  const params = new URLSearchParams({ purpose });
  return api.get<UploadPolicyOut>(
    workspacePath(workspaceId, `/uploads/policy?${params.toString()}`),
  );
}

export async function getWorkspaceUploadStatus(
  workspaceId: string,
  uploadId: string,
): Promise<UploadStatusOut> {
  return api.get<UploadStatusOut>(workspacePath(workspaceId, `/uploads/${uploadId}`));
}

export async function uploadWorkspacePart(params: {
  workspaceId: string;
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  await apiRequest<unknown>(
    workspacePath(params.workspaceId, `/uploads/${params.uploadId}/parts/${params.partNumber}`),
    {
      method: "PUT",
      body: params.chunk,
      signal: params.signal,
    },
  );
}

export async function presignWorkspaceUploadPart(params: {
  workspaceId: string;
  uploadId: string;
  partNumber: number;
}): Promise<UploadPartPresignOut> {
  return api.post<UploadPartPresignOut>(
    workspacePath(
      params.workspaceId,
      `/uploads/${params.uploadId}/parts/${params.partNumber}/presign`,
    ),
  );
}

export async function commitWorkspaceUploadPart(params: {
  workspaceId: string;
  uploadId: string;
  partNumber: number;
  payload: UploadPartCommitRequest;
}): Promise<void> {
  await api.post<unknown>(
    workspacePath(
      params.workspaceId,
      `/uploads/${params.uploadId}/parts/${params.partNumber}/commit`,
    ),
    params.payload,
  );
}

export async function completeWorkspaceUpload(
  workspaceId: string,
  uploadId: string,
): Promise<UploadCompleteOut> {
  return api.post<UploadCompleteOut>(workspacePath(workspaceId, `/uploads/${uploadId}/complete`));
}

export async function abortWorkspaceUpload(
  workspaceId: string,
  uploadId: string,
): Promise<UploadAbortOut> {
  return api.post<UploadAbortOut>(workspacePath(workspaceId, `/uploads/${uploadId}/abort`));
}

// ---------------------------------------------------------------------------
// Avatar uploads (current user)
// ---------------------------------------------------------------------------

export async function initAvatarUpload(payload: AvatarUploadInitRequest): Promise<UploadInitOut> {
  return api.post<UploadInitOut>("/auth/me/avatar/uploads/init", payload);
}

export async function getAvatarUploadPolicy(): Promise<UploadPolicyOut> {
  return api.get<UploadPolicyOut>("/auth/me/avatar/uploads/policy");
}

export async function getAvatarUploadStatus(uploadId: string): Promise<UploadStatusOut> {
  return api.get<UploadStatusOut>(`/auth/me/avatar/uploads/${encodeURIComponent(uploadId)}`);
}

export async function uploadAvatarPart(params: {
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  await apiRequest<unknown>(
    `/auth/me/avatar/uploads/${encodeURIComponent(params.uploadId)}/parts/${params.partNumber}`,
    {
      method: "PUT",
      body: params.chunk,
      signal: params.signal,
    },
  );
}

export async function presignAvatarUploadPart(params: {
  uploadId: string;
  partNumber: number;
}): Promise<UploadPartPresignOut> {
  return api.post<UploadPartPresignOut>(
    `/auth/me/avatar/uploads/${encodeURIComponent(params.uploadId)}/parts/${params.partNumber}/presign`,
  );
}

export async function commitAvatarUploadPart(params: {
  uploadId: string;
  partNumber: number;
  payload: UploadPartCommitRequest;
}): Promise<void> {
  await api.post<unknown>(
    `/auth/me/avatar/uploads/${encodeURIComponent(params.uploadId)}/parts/${params.partNumber}/commit`,
    params.payload,
  );
}

export async function completeAvatarUpload(uploadId: string): Promise<UploadCompleteOut> {
  return api.post<UploadCompleteOut>(
    `/auth/me/avatar/uploads/${encodeURIComponent(uploadId)}/complete`,
  );
}

export async function abortAvatarUpload(uploadId: string): Promise<UploadAbortOut> {
  return api.post<UploadAbortOut>(`/auth/me/avatar/uploads/${encodeURIComponent(uploadId)}/abort`);
}
