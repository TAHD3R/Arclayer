import { api, apiRequest } from "@/lib/http";
import { organizationPath, projectPath } from "@/lib/api";
import type {
  UploadInitRequest,
  UploadInitOut,
  UploadStatusOut,
  UploadCompleteOut,
  UploadAbortOut,
  UploadPartPresignOut,
  UploadPartCommitRequest,
  AvatarUploadInitRequest,
} from "@/types/api";

export async function initUpload(
  projectId: string,
  payload: UploadInitRequest,
): Promise<UploadInitOut> {
  return api.post<UploadInitOut>(projectPath(projectId, "/uploads/init"), payload);
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
// Organization-scoped uploads
// ---------------------------------------------------------------------------

export async function initOrganizationUpload(
  organizationId: string,
  payload: UploadInitRequest,
): Promise<UploadInitOut> {
  return api.post<UploadInitOut>(organizationPath(organizationId, "/uploads/init"), payload);
}

export async function getOrganizationUploadStatus(
  organizationId: string,
  uploadId: string,
): Promise<UploadStatusOut> {
  return api.get<UploadStatusOut>(organizationPath(organizationId, `/uploads/${uploadId}`));
}

export async function uploadOrganizationPart(params: {
  organizationId: string;
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  await apiRequest<unknown>(
    organizationPath(
      params.organizationId,
      `/uploads/${params.uploadId}/parts/${params.partNumber}`,
    ),
    {
      method: "PUT",
      body: params.chunk,
      signal: params.signal,
    },
  );
}

export async function presignOrganizationUploadPart(params: {
  organizationId: string;
  uploadId: string;
  partNumber: number;
}): Promise<UploadPartPresignOut> {
  return api.post<UploadPartPresignOut>(
    organizationPath(
      params.organizationId,
      `/uploads/${params.uploadId}/parts/${params.partNumber}/presign`,
    ),
  );
}

export async function commitOrganizationUploadPart(params: {
  organizationId: string;
  uploadId: string;
  partNumber: number;
  payload: UploadPartCommitRequest;
}): Promise<void> {
  await api.post<unknown>(
    organizationPath(
      params.organizationId,
      `/uploads/${params.uploadId}/parts/${params.partNumber}/commit`,
    ),
    params.payload,
  );
}

export async function completeOrganizationUpload(
  organizationId: string,
  uploadId: string,
): Promise<UploadCompleteOut> {
  return api.post<UploadCompleteOut>(
    organizationPath(organizationId, `/uploads/${uploadId}/complete`),
  );
}

export async function abortOrganizationUpload(
  organizationId: string,
  uploadId: string,
): Promise<UploadAbortOut> {
  return api.post<UploadAbortOut>(organizationPath(organizationId, `/uploads/${uploadId}/abort`));
}

// ---------------------------------------------------------------------------
// Avatar uploads (current user)
// ---------------------------------------------------------------------------

export async function initAvatarUpload(payload: AvatarUploadInitRequest): Promise<UploadInitOut> {
  return api.post<UploadInitOut>("/auth/me/avatar/uploads/init", payload);
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
