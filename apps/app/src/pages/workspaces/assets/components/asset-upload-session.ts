import {
  abortUpload,
  commitUploadPart,
  completeUpload,
  initUpload,
  presignUploadPart,
  uploadPart,
} from "@/api/uploads";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { uploadPresignedPart } from "@/lib/assets/storage-transfer";

const LOCAL_UPLOAD_METHOD = "local";
const S3_MULTIPART_UPLOAD_METHOD = "s3_multipart";

export type AssetUploadCheckpoint = Readonly<{
  uploadId: string;
  chunkSize: number;
  totalParts: number;
  method: typeof LOCAL_UPLOAD_METHOD | typeof S3_MULTIPART_UPLOAD_METHOD;
}>;

type AssetUploadInitPayload = Parameters<typeof initUpload>[1];

type UploadPartMessages = Readonly<{
  s3PutFailed: string;
  s3EtagMissing: string;
}>;

type ScopedUploadsApi = Readonly<{
  init: (payload: AssetUploadInitPayload) => ReturnType<typeof initUpload>;
  abort: (uploadId: string) => Promise<void>;
  uploadPart: (params: Omit<Parameters<typeof uploadPart>[0], "projectId">) => Promise<void>;
  presignPart: (
    params: Omit<Parameters<typeof presignUploadPart>[0], "projectId">,
  ) => ReturnType<typeof presignUploadPart>;
  commitPart: (params: Omit<Parameters<typeof commitUploadPart>[0], "projectId">) => Promise<void>;
  complete: (uploadId: string) => ReturnType<typeof completeUpload>;
}>;

function getScopedUploadsApi(scope: AssetScopeRef): ScopedUploadsApi {
  const scopeId = String(scope.id || "").trim();
  if (!scopeId) throw new Error("ASSET_SCOPE_NOT_SELECTED");
  if (scope.type !== "project") throw new Error("ASSET_SCOPE_UNSUPPORTED");

  return {
    init: (payload) => initUpload(scopeId, payload),
    abort: async (uploadId) => {
      await abortUpload(scopeId, uploadId);
    },
    uploadPart: async (params) => {
      await uploadPart({ ...params, projectId: scopeId });
    },
    presignPart: (params) => presignUploadPart({ ...params, projectId: scopeId }),
    commitPart: async (params) => {
      await commitUploadPart({ ...params, projectId: scopeId });
    },
    complete: (uploadId) => completeUpload(scopeId, uploadId),
  };
}

function parsePositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`ASSET_UPLOAD_PLAN_INVALID:${field}`);
  }
  return parsed;
}

function toCheckpoint(init: Awaited<ReturnType<typeof initUpload>>): AssetUploadCheckpoint {
  const uploadId = String(init.uploadId || "").trim();
  if (!uploadId) throw new Error("ASSET_UPLOAD_PLAN_INVALID:uploadId");

  const method = String(init.method || "").trim();
  if (method !== LOCAL_UPLOAD_METHOD && method !== S3_MULTIPART_UPLOAD_METHOD) {
    throw new Error("ASSET_UPLOAD_PLAN_INVALID:method");
  }

  return Object.freeze({
    uploadId,
    chunkSize: parsePositiveInteger(init.chunkSize, "chunkSize"),
    totalParts: parsePositiveInteger(init.totalParts, "totalParts"),
    method,
  });
}

async function abortCheckpointAfterEarlyCancellation(
  api: ScopedUploadsApi,
  checkpoint: AssetUploadCheckpoint,
): Promise<never> {
  const cancellation = new DOMException("Upload canceled.", "AbortError");
  try {
    await api.abort(checkpoint.uploadId);
  } catch (cleanupError) {
    throw new AggregateError(
      [cancellation, cleanupError],
      "Upload was canceled, but the upload session could not be aborted.",
    );
  }
  throw cancellation;
}

async function uploadCheckpointPart(params: {
  api: ScopedUploadsApi;
  checkpoint: AssetUploadCheckpoint;
  partNumber: number;
  chunk: Blob;
  signal: AbortSignal;
  messages: UploadPartMessages;
}): Promise<void> {
  if (params.checkpoint.method === LOCAL_UPLOAD_METHOD) {
    await params.api.uploadPart({
      uploadId: params.checkpoint.uploadId,
      partNumber: params.partNumber,
      chunk: params.chunk,
      signal: params.signal,
    });
    return;
  }

  const presign = await params.api.presignPart({
    uploadId: params.checkpoint.uploadId,
    partNumber: params.partNumber,
  });
  const etag = await uploadPresignedPart({
    presign,
    chunk: params.chunk,
    signal: params.signal,
    errorMessage: params.messages.s3PutFailed,
    missingEtagMessage: params.messages.s3EtagMissing,
  });
  await params.api.commitPart({
    uploadId: params.checkpoint.uploadId,
    partNumber: params.partNumber,
    payload: { etag, sizeBytes: params.chunk.size },
  });
}

export async function transferAssetUpload(params: {
  scope: AssetScopeRef;
  file: File;
  initPayload: AssetUploadInitPayload;
  checkpoint?: AssetUploadCheckpoint;
  signal: AbortSignal;
  messages: UploadPartMessages;
  onCheckpoint: (checkpoint: AssetUploadCheckpoint) => void;
  onProgress: (uploadedBytes: number, progress: number) => void;
}): Promise<AssetUploadCheckpoint> {
  const api = getScopedUploadsApi(params.scope);
  const checkpoint = params.checkpoint ?? toCheckpoint(await api.init(params.initPayload));
  params.onCheckpoint(checkpoint);
  if (params.signal.aborted) {
    await abortCheckpointAfterEarlyCancellation(api, checkpoint);
  }

  let uploadedBytes = 0;
  for (let partNumber = 1; partNumber <= checkpoint.totalParts; partNumber += 1) {
    const start = (partNumber - 1) * checkpoint.chunkSize;
    const end = Math.min(params.file.size, start + checkpoint.chunkSize);
    if (params.file.size > 0 && start >= params.file.size) {
      throw new Error("ASSET_UPLOAD_PLAN_INVALID:totalParts");
    }
    const chunk = params.file.slice(start, end);
    await uploadCheckpointPart({
      api,
      checkpoint,
      partNumber,
      chunk,
      signal: params.signal,
      messages: params.messages,
    });
    uploadedBytes += chunk.size;
    const progress =
      params.file.size > 0 ? Math.round((uploadedBytes / params.file.size) * 100) : 100;
    params.onProgress(uploadedBytes, Math.min(100, Math.max(0, progress)));
  }

  if (uploadedBytes !== params.file.size) {
    throw new Error("ASSET_UPLOAD_PLAN_INVALID:fileCoverage");
  }

  return checkpoint;
}

export async function completeAssetUploadSession(
  scope: AssetScopeRef,
  uploadId: string,
): Promise<string> {
  const done = await getScopedUploadsApi(scope).complete(uploadId);
  return done.assetId;
}

export async function abortAssetUploadSession(
  scope: AssetScopeRef,
  uploadId: string,
): Promise<void> {
  await getScopedUploadsApi(scope).abort(uploadId);
}
