import { api, apiRequest } from "@/lib/http";
import { workspacePath } from "@/lib/api";
import type {
  UploadInitRequest,
  UploadInitOut,
  UploadStatusOut,
  UploadCompleteOut,
  UploadAbortOut,
  UploadPartPresignOut,
  UploadPartCommitRequest,
} from "@/types/api";

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
