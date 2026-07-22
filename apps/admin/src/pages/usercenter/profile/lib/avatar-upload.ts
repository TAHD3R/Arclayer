import {
  abortAvatarUpload,
  commitAvatarUploadPart,
  completeAvatarUpload,
  getAvatarUploadPolicy,
  initAvatarUpload,
  presignAvatarUploadPart,
  uploadAvatarPart,
} from "@/api/uploads";
import {
  abortAssetUploadBeforeCompletion,
  completeAssetUpload,
  createAssetUploadCompletionCheckpoint,
} from "@/lib/assets/upload-completion";
import { uploadPresignedPart } from "@/lib/assets/storage-transfer";

const MIN_UPLOAD_CHUNK_SIZE = 1;
const MIN_UPLOAD_PARTS = 1;

type UploadPlan = {
  chunkSize: number;
  totalParts: number;
  method: string;
};

function isFileAccepted(file: File, accept: string): boolean {
  const tokens = accept
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mime = (file.type || "").toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return Boolean(ext) && token === `.${ext}`;
    if (token.endsWith("/*")) return mime.startsWith(`${token.slice(0, -1)}`);
    return Boolean(mime) && mime === token;
  });
}

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

  const etag = await uploadPresignedPart({
    presign,
    chunk: params.chunk,
    signal: params.signal,
    errorMessage: "Avatar upload failed on multipart PUT request.",
    missingEtagMessage: "Avatar upload response is missing ETag.",
  });

  await commitAvatarUploadPart({
    uploadId: params.uploadId,
    partNumber: params.partNumber,
    payload: { etag, sizeBytes: params.chunk.size },
  });
}

export async function uploadAvatarFile(file: File, signal?: AbortSignal): Promise<string> {
  let uploadId: string | null = null;
  let completionStarted = false;
  try {
    const policy = await getAvatarUploadPolicy();
    if (file.size > policy.maxSizeBytes) {
      throw new Error("UPLOAD_TOO_LARGE");
    }
    if (!isFileAccepted(file, policy.accept || "")) {
      throw new Error("UPLOAD_TYPE_NOT_ALLOWED");
    }

    const init = await initAvatarUpload({
      filename: file.name,
      mime: file.type || null,
      sizeBytes: file.size,
      expectedSha256: null,
    });
    const activeUploadId = init.uploadId;
    uploadId = activeUploadId;

    const plan = buildUploadPlan(init);
    const parts = Array.from({ length: plan.totalParts }, (_, index) => index + 1);
    await runSequentially(parts, async (partNumber) => {
      const start = (partNumber - 1) * plan.chunkSize;
      const end = Math.min(file.size, start + plan.chunkSize);
      const chunk = file.slice(start, end);

      if (plan.method === "s3_multipart") {
        await uploadS3Part({ uploadId: activeUploadId, partNumber, chunk, signal });
      } else {
        await uploadLocalPart({ uploadId: activeUploadId, partNumber, chunk, signal });
      }
    });

    const checkpoint = createAssetUploadCompletionCheckpoint({
      uploadId: activeUploadId,
      complete: async () => {
        const done = await completeAvatarUpload(activeUploadId);
        return done.assetId;
      },
    });
    completionStarted = true;
    return await completeAssetUpload(checkpoint);
  } catch (error) {
    if (uploadId && !completionStarted) {
      const incompleteUploadId = uploadId;
      return await abortAssetUploadBeforeCompletion({
        uploadId: incompleteUploadId,
        uploadError: error,
        abort: async () => abortAvatarUpload(incompleteUploadId),
      });
    }
    throw error;
  }
}
