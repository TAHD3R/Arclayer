import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  abortUpload: vi.fn(),
  commitUploadPart: vi.fn(),
  completeUpload: vi.fn(),
  initUpload: vi.fn(),
  presignUploadPart: vi.fn(),
  uploadPart: vi.fn(),
}));

vi.mock("@/api/uploads", () => apiMocks);

vi.mock("@/lib/assets/storage-transfer", () => ({
  uploadPresignedPart: vi.fn(),
}));

import {
  completeAssetUploadSession,
  transferAssetUpload,
  type AssetUploadCheckpoint,
} from "@/pages/workspaces/assets/components/asset-upload-session";

const PROJECT_SCOPE = { type: "project" as const, id: "project-1" };
const MESSAGES = {
  s3PutFailed: "S3 PUT failed",
  s3EtagMissing: "ETag missing",
};

function transferParams(params?: {
  checkpoint?: AssetUploadCheckpoint;
  signal?: AbortSignal;
  onCheckpoint?: (checkpoint: AssetUploadCheckpoint) => void;
}) {
  const file = new File(["abcdefgh"], "cover.png", { type: "image/png" });
  return {
    scope: PROJECT_SCOPE,
    file,
    checkpoint: params?.checkpoint,
    signal: params?.signal ?? new AbortController().signal,
    initPayload: {
      purpose: "library",
      filename: file.name,
      mime: file.type,
      sizeBytes: file.size,
      expectedSha256: null,
      visibility: "public",
      indexable: false,
      folderId: null,
    },
    messages: MESSAGES,
    onCheckpoint: params?.onCheckpoint ?? vi.fn(),
    onProgress: vi.fn(),
  };
}

describe("asset upload session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.initUpload.mockResolvedValue({
      uploadId: "upload-1",
      chunkSize: 4,
      totalParts: 2,
      method: "local",
    });
    apiMocks.uploadPart.mockResolvedValue(undefined);
    apiMocks.abortUpload.mockResolvedValue(undefined);
  });

  it("reuses a persisted checkpoint after a part failure instead of initializing a new session", async () => {
    let checkpoint: AssetUploadCheckpoint | undefined;
    apiMocks.uploadPart.mockRejectedValueOnce(new Error("part failed"));

    await expect(
      transferAssetUpload(
        transferParams({
          onCheckpoint: (value) => {
            checkpoint = value;
          },
        }),
      ),
    ).rejects.toThrow("part failed");

    expect(checkpoint?.uploadId).toBe("upload-1");
    apiMocks.uploadPart.mockResolvedValue(undefined);
    await expect(transferAssetUpload(transferParams({ checkpoint }))).resolves.toMatchObject({
      uploadId: "upload-1",
    });

    expect(apiMocks.initUpload).toHaveBeenCalledTimes(1);
    expect(apiMocks.uploadPart).toHaveBeenLastCalledWith(
      expect.objectContaining({ uploadId: "upload-1" }),
    );
  });

  it("calls complete directly with the checkpoint uploadId", async () => {
    apiMocks.completeUpload.mockResolvedValue({ assetId: "asset-1" });

    await expect(completeAssetUploadSession(PROJECT_SCOPE, "upload-1")).resolves.toBe("asset-1");

    expect(apiMocks.completeUpload).toHaveBeenCalledWith("project-1", "upload-1");
    expect(apiMocks.initUpload).not.toHaveBeenCalled();
    expect(apiMocks.uploadPart).not.toHaveBeenCalled();
  });

  it("aborts a session created after the caller already requested cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      transferAssetUpload(transferParams({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(apiMocks.abortUpload).toHaveBeenCalledWith("project-1", "upload-1");
    expect(apiMocks.uploadPart).not.toHaveBeenCalled();
  });

  it("rejects an invalid backend upload plan instead of substituting local defaults", async () => {
    apiMocks.initUpload.mockResolvedValue({
      uploadId: "upload-1",
      chunkSize: 0,
      totalParts: 1,
      method: "local",
    });

    await expect(transferAssetUpload(transferParams())).rejects.toThrow(
      "ASSET_UPLOAD_PLAN_INVALID:chunkSize",
    );
    expect(apiMocks.uploadPart).not.toHaveBeenCalled();
  });
});
