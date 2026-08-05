import { describe, expect, it, vi } from "vitest";

import {
  abortAssetUploadBeforeCompletion,
  AssetUploadCleanupError,
  AssetUploadCompletionRequiredError,
  completeAssetUpload,
  createAssetUploadCompletionCheckpoint,
  getAssetUploadCompletionCheckpoint,
} from "@/lib/assets/upload-completion";

describe("asset upload completion checkpoint", () => {
  it("returns the asset id when the explicit completion succeeds", async () => {
    const complete = vi.fn().mockResolvedValue("asset-1");
    const checkpoint = createAssetUploadCompletionCheckpoint({ uploadId: "upload-1", complete });

    await expect(completeAssetUpload(checkpoint)).resolves.toBe("asset-1");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("preserves the exact checkpoint when completion fails", async () => {
    const completionError = new Error("database commit failed");
    const checkpoint = createAssetUploadCompletionCheckpoint({
      uploadId: "upload-2",
      complete: vi.fn().mockRejectedValue(completionError),
    });

    const promise = completeAssetUpload(checkpoint);

    await expect(promise).rejects.toBeInstanceOf(AssetUploadCompletionRequiredError);
    await expect(promise).rejects.toMatchObject({
      checkpoint,
      completionError,
    });

    try {
      await promise;
    } catch (error) {
      expect(getAssetUploadCompletionCheckpoint(error)).toBe(checkpoint);
    }
  });
});

describe("pre-completion upload cleanup", () => {
  it("rethrows the upload failure after abort succeeds", async () => {
    const uploadError = new Error("part upload failed");
    const abort = vi.fn().mockResolvedValue(undefined);

    await expect(
      abortAssetUploadBeforeCompletion({ uploadId: "upload-3", uploadError, abort }),
    ).rejects.toBe(uploadError);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("exposes both failures when abort cleanup fails", async () => {
    const uploadError = new Error("part upload failed");
    const cleanupError = new Error("abort failed");

    await expect(
      abortAssetUploadBeforeCompletion({
        uploadId: "upload-4",
        uploadError,
        abort: vi.fn().mockRejectedValue(cleanupError),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AssetUploadCleanupError>>({
        name: "AssetUploadCleanupError",
        uploadId: "upload-4",
        uploadError,
        cleanupError,
      }),
    );
  });
});
