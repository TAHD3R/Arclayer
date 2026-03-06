import type { UploadInitRequest } from "@/types/api";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import type { UploadPartCommitRequest } from "@/types/api";
import {
  abortOrganizationUpload,
  abortUpload,
  commitOrganizationUploadPart,
  commitUploadPart,
  completeOrganizationUpload,
  completeUpload,
  initOrganizationUpload,
  initUpload,
  presignOrganizationUploadPart,
  presignUploadPart,
  uploadOrganizationPart,
  uploadPart,
} from "@/api/uploads";

type ScopedUploadsApi = {
  init: (payload: UploadInitRequest) => ReturnType<typeof initUpload>;
  abort: (uploadId: string) => Promise<unknown>;
  uploadPart: (params: {
    uploadId: string;
    partNumber: number;
    chunk: Blob;
    signal?: AbortSignal;
  }) => Promise<void>;
  presignPart: (params: {
    uploadId: string;
    partNumber: number;
  }) => ReturnType<typeof presignUploadPart>;
  commitPart: (params: {
    uploadId: string;
    partNumber: number;
    payload: UploadPartCommitRequest;
  }) => Promise<void>;
  complete: (uploadId: string) => ReturnType<typeof completeUpload>;
};

export function getScopedUploadsApi(scope: AssetScopeRef): ScopedUploadsApi {
  const rawId = String(scope.id || "").trim();
  if (!rawId) throw new Error("ASSET_SCOPE_NOT_SELECTED");

  if (scope.type === "workspace") {
    return {
      init: (payload) => initUpload(rawId, payload),
      abort: (uploadId) => abortUpload(rawId, uploadId),
      uploadPart: async (params) => {
        await uploadPart({ ...params, workspaceId: rawId });
      },
      presignPart: (params) => presignUploadPart({ ...params, workspaceId: rawId }),
      commitPart: async (params) => {
        await commitUploadPart({ ...params, workspaceId: rawId });
      },
      complete: (uploadId) => completeUpload(rawId, uploadId),
    };
  }

  if (scope.type === "organization") {
    return {
      init: (payload) => initOrganizationUpload(rawId, payload),
      abort: (uploadId) => abortOrganizationUpload(rawId, uploadId),
      uploadPart: async (params) => {
        await uploadOrganizationPart({ ...params, organizationId: rawId });
      },
      presignPart: (params) => presignOrganizationUploadPart({ ...params, organizationId: rawId }),
      commitPart: async (params) => {
        await commitOrganizationUploadPart({ ...params, organizationId: rawId });
      },
      complete: (uploadId) => completeOrganizationUpload(rawId, uploadId),
    };
  }

  throw new Error("ASSET_SCOPE_UNSUPPORTED");
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type UploadSessionInit = {
  uploadId: string;
  chunkSize: number;
  totalParts: number;
  method: "local" | "s3_multipart";
};

function normalizeUploadMethod(method?: string | null): UploadSessionInit["method"] {
  return method === "s3_multipart" ? "s3_multipart" : "local";
}

async function initUploadSession(options: {
  api: ScopedUploadsApi;
  purpose: string;
  file: File;
  folderId?: string | null;
}): Promise<UploadSessionInit> {
  const init = await options.api.init({
    purpose: options.purpose,
    filename: options.file.name,
    mime: options.file.type || null,
    sizeBytes: options.file.size,
    expectedSha256: null,
    visibility: "public",
    indexable: false,
    folderId: options.folderId ?? null,
  });

  return {
    uploadId: init.uploadId,
    chunkSize: Math.max(1, Number(init.chunkSize || 0)),
    totalParts: Math.max(1, Number(init.totalParts || 1)),
    method: normalizeUploadMethod(init.method),
  };
}

async function uploadPartToS3(options: {
  api: ScopedUploadsApi;
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
  t: TranslateFn;
}): Promise<void> {
  const presign = await options.api.presignPart({
    uploadId: options.uploadId,
    partNumber: options.partNumber,
  });
  const res = await fetch(presign.url, {
    method: presign.method || "PUT",
    headers: presign.headers || {},
    body: options.chunk,
    signal: options.signal,
  });
  if (!res.ok) throw new Error(options.t("assets:ASSET_UPLOAD_S3_PUT_FAILED"));
  const etag = res.headers.get("etag") || res.headers.get("ETag");
  if (!etag) throw new Error(options.t("assets:ASSET_UPLOAD_S3_ETAG_MISSING"));

  await options.api.commitPart({
    uploadId: options.uploadId,
    partNumber: options.partNumber,
    payload: { etag, sizeBytes: options.chunk.size },
  });
}

async function uploadAllParts(options: {
  api: ScopedUploadsApi;
  session: UploadSessionInit;
  file: File;
  t: TranslateFn;
  signal?: AbortSignal;
}): Promise<void> {
  const parts = Array.from({ length: options.session.totalParts }, (_, i) => i + 1);
  return parts.reduce<Promise<void>>((p, partNumber) => {
    return p.then(() => {
      const start = (partNumber - 1) * options.session.chunkSize;
      const end = Math.min(options.file.size, start + options.session.chunkSize);
      const chunk = options.file.slice(start, end);

      if (options.session.method === "s3_multipart") {
        return uploadPartToS3({
          api: options.api,
          uploadId: options.session.uploadId,
          partNumber,
          chunk,
          signal: options.signal,
          t: options.t,
        });
      }

      return options.api.uploadPart({
        uploadId: options.session.uploadId,
        partNumber,
        chunk,
        signal: options.signal,
      });
    });
  }, Promise.resolve());
}

async function abortBestEffort(api: ScopedUploadsApi, uploadId: string): Promise<void> {
  try {
    await api.abort(uploadId);
  } catch {
    // Keep original error; abort is best-effort cleanup.
  }
}

export async function uploadSingleAssetFromFile(options: {
  scope: AssetScopeRef;
  purpose: string;
  file: File;
  t: TranslateFn;
  folderId?: string | null;
  signal?: AbortSignal;
}): Promise<string> {
  const api = getScopedUploadsApi(options.scope);
  const purpose = String(options.purpose || "").trim() || "library";
  const session = await initUploadSession({
    api,
    purpose,
    file: options.file,
    folderId: options.folderId,
  });
  try {
    await uploadAllParts({
      api,
      session,
      file: options.file,
      t: options.t,
      signal: options.signal,
    });
    const done = await api.complete(session.uploadId);
    return done.assetId;
  } catch (err) {
    await abortBestEffort(api, session.uploadId);
    throw err;
  }
}
