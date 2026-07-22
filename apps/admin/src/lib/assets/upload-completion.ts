export type AssetUploadCompletionCheckpoint = Readonly<{
  uploadId: string;
  complete: () => Promise<string>;
}>;

export class AssetUploadCompletionRequiredError extends Error {
  readonly checkpoint: AssetUploadCompletionCheckpoint;
  readonly completionError: unknown;

  constructor(checkpoint: AssetUploadCompletionCheckpoint, completionError: unknown) {
    super("Asset upload completion requires an explicit retry.", { cause: completionError });
    this.name = "AssetUploadCompletionRequiredError";
    this.checkpoint = checkpoint;
    this.completionError = completionError;
  }
}

export class AssetUploadCleanupError extends Error {
  readonly uploadId: string;
  readonly uploadError: unknown;
  readonly cleanupError: unknown;

  constructor(params: { uploadId: string; uploadError: unknown; cleanupError: unknown }) {
    super("Asset upload failed and its pre-completion cleanup also failed.", {
      cause: params.cleanupError,
    });
    this.name = "AssetUploadCleanupError";
    this.uploadId = params.uploadId;
    this.uploadError = params.uploadError;
    this.cleanupError = params.cleanupError;
  }
}

export function createAssetUploadCompletionCheckpoint(params: {
  uploadId: string;
  complete: () => Promise<string>;
}): AssetUploadCompletionCheckpoint {
  return Object.freeze({
    uploadId: params.uploadId,
    complete: params.complete,
  });
}

export async function completeAssetUpload(
  checkpoint: AssetUploadCompletionCheckpoint,
): Promise<string> {
  try {
    return await checkpoint.complete();
  } catch (error) {
    throw new AssetUploadCompletionRequiredError(checkpoint, error);
  }
}

export function getAssetUploadCompletionCheckpoint(
  error: unknown,
): AssetUploadCompletionCheckpoint | null {
  return error instanceof AssetUploadCompletionRequiredError ? error.checkpoint : null;
}

export async function abortAssetUploadBeforeCompletion(params: {
  uploadId: string;
  uploadError: unknown;
  abort: () => Promise<unknown>;
}): Promise<never> {
  try {
    await params.abort();
  } catch (cleanupError) {
    throw new AssetUploadCleanupError({
      uploadId: params.uploadId,
      uploadError: params.uploadError,
      cleanupError,
    });
  }

  throw params.uploadError;
}
