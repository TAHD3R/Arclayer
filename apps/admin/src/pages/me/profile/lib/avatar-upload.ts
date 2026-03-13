import {
  abortAvatarUpload,
  commitAvatarUploadPart,
  completeAvatarUpload,
  initAvatarUpload,
  presignAvatarUploadPart,
  uploadAvatarPart,
} from "@/api/uploads";

const MIN_UPLOAD_CHUNK_SIZE = 1;
const MIN_UPLOAD_PARTS = 1;

type UploadPlan = {
  chunkSize: number;
  totalParts: number;
  method: string;
};

async function runSequentially(
  items: readonly number[],
  runItem: (partNumber: number) => Promise<void>,
): Promise<void> {
  await items.reduce<Promise<void>>(
    (chain, partNumber) => chain.then(() => runItem(partNumber)),
    Promise.resolve(),
  );
}

function buildUploadPlan(init: {
  chunkSize?: number | null;
  totalParts?: number | null;
  method?: string | null;
}): UploadPlan {
  return {
    chunkSize: Math.max(MIN_UPLOAD_CHUNK_SIZE, Number(init.chunkSize || 0)),
    totalParts: Math.max(MIN_UPLOAD_PARTS, Number(init.totalParts || 1)),
    method: String(init.method || "local"),
  };
}

async function uploadLocalPart(params: {
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}) {
  await uploadAvatarPart({
    uploadId: params.uploadId,
    partNumber: params.partNumber,
    chunk: params.chunk,
    signal: params.signal,
  });
}

async function uploadS3Part(params: {
  uploadId: string;
  partNumber: number;
  chunk: Blob;
  signal?: AbortSignal;
}) {
  const presign = await presignAvatarUploadPart({
    uploadId: params.uploadId,
    partNumber: params.partNumber,
  });

  const res = await fetch(presign.url, {
    method: presign.method || "PUT",
    headers: presign.headers || {},
    body: params.chunk,
    signal: params.signal,
  });
  if (!res.ok) throw new Error("Avatar upload failed on multipart PUT request.");

  const etag = res.headers.get("etag") || res.headers.get("ETag");
  if (!etag) throw new Error("Avatar upload response is missing ETag.");

  await commitAvatarUploadPart({
    uploadId: params.uploadId,
    partNumber: params.partNumber,
    payload: { etag, sizeBytes: params.chunk.size },
  });
}

export async function uploadAvatarFile(file: File, signal?: AbortSignal): Promise<string> {
  let uploadId: string | null = null;
  try {
    const init = await initAvatarUpload({
      filename: file.name,
      mime: file.type || null,
      sizeBytes: file.size,
      expectedSha256: null,
    });
    uploadId = init.uploadId;

    const plan = buildUploadPlan(init);
    const parts = Array.from({ length: plan.totalParts }, (_, index) => index + 1);
    await runSequentially(parts, async (partNumber) => {
      const start = (partNumber - 1) * plan.chunkSize;
      const end = Math.min(file.size, start + plan.chunkSize);
      const chunk = file.slice(start, end);

      if (plan.method === "s3_multipart") {
        await uploadS3Part({ uploadId, partNumber, chunk, signal });
      } else {
        await uploadLocalPart({ uploadId, partNumber, chunk, signal });
      }
    });

    const done = await completeAvatarUpload(uploadId);
    return done.assetId;
  } catch (error) {
    if (uploadId) {
      try {
        await abortAvatarUpload(uploadId);
      } catch {
        // Ignore abort cleanup errors and rethrow original error.
      }
    }
    throw error;
  }
}
