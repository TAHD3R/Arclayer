import { api, apiRequest } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type UploadInitRequest = {
  purpose: string;
  filename: string;
  mime?: string | null;
  sizeBytes: number;
  expectedSha256?: string | null;
  visibility?: string | null;
  indexable?: boolean | null;
  folderId?: string | null;
};

export type UploadInitOut = {
  uploadId: string;
  chunkSize: number;
  totalParts: number;
  expiresAt: string;
  /** local | s3_multipart */
  method?: string | null;
  reservedAssetId?: string | null;
  objectKey?: string | null;
};

export type UploadStatusOut = {
  uploadId: string;
  status: string;
  missingParts: number[];
  uploadedParts: number;
  totalParts: number;
};

export type UploadCompleteOut = {
  assetId: string;
};

export type UploadAbortOut = {
  uploadId: string;
  status: string;
};

export type UploadPartPresignOut = {
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export type UploadPartCommitRequest = {
  etag: string;
  sizeBytes: number;
};

export async function initUpload(
  workspaceId: string,
  payload: UploadInitRequest,
): Promise<UploadInitOut> {
  return api.post<UploadInitOut>(workspacePath(workspaceId, "/uploads/init"), payload);
}

export async function getUploadStatus(
  workspaceId: string,
  uploadId: string,
): Promise<UploadStatusOut> {
  return api.get<UploadStatusOut>(workspacePath(workspaceId, `/uploads/${uploadId}`));
}

export async function uploadPart(params: {
  workspaceId: string;
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}): Promise<void> {
  // This endpoint expects raw bytes, not JSON.
  await apiRequest<unknown>(
    workspacePath(params.workspaceId, `/uploads/${params.uploadId}/parts/${params.partNumber}`),
    {
      method: "PUT",
      body: params.chunk,
      signal: params.signal,
    },
  );
}

export async function presignUploadPart(params: {
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

export async function commitUploadPart(params: {
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

export async function completeUpload(
  workspaceId: string,
  uploadId: string,
): Promise<UploadCompleteOut> {
  return api.post<UploadCompleteOut>(workspacePath(workspaceId, `/uploads/${uploadId}/complete`));
}

export async function abortUpload(workspaceId: string, uploadId: string): Promise<UploadAbortOut> {
  return api.post<UploadAbortOut>(workspacePath(workspaceId, `/uploads/${uploadId}/abort`));
}
