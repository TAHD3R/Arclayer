import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  AssetUploadCleanupError,
  AssetUploadCompletionRequiredError,
  completeAssetUpload,
  getAssetUploadCompletionCheckpoint,
} from "@/lib/assets/upload-completion";
import { uploadAvatarFile } from "@/pages/usercenter/profile/lib/avatar-upload";
import {
  abortAvatarUpload,
  commitAvatarUploadPart,
  completeAvatarUpload,
  getAvatarUploadPolicy,
  initAvatarUpload,
  presignAvatarUploadPart,
  uploadAvatarPart,
} from "@/api/uploads";

vi.mock("@/api/uploads", () => ({
  initAvatarUpload: vi.fn(),
  uploadAvatarPart: vi.fn(),
  presignAvatarUploadPart: vi.fn(),
  commitAvatarUploadPart: vi.fn(),
  completeAvatarUpload: vi.fn(),
  abortAvatarUpload: vi.fn(),
  getAvatarUploadPolicy: vi.fn(),
}));

describe("uploadAvatarFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAvatarUploadPolicy).mockResolvedValue({
      purpose: "avatar",
      maxSizeMb: 10,
      maxSizeBytes: 10 * 1024 * 1024,
      allowedExtensions: ["jpg", "jpeg", "png", "webp"],
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      accept: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
    } as never);
  });

  it("local 模式下上传完成后返回 assetId", async () => {
    vi.mocked(initAvatarUpload).mockResolvedValue({
      uploadId: "u-1",
      chunkSize: 1024,
      totalParts: 1,
      method: "local",
    } as never);
    vi.mocked(uploadAvatarPart).mockResolvedValue(undefined);
    vi.mocked(completeAvatarUpload).mockResolvedValue({ assetId: "asset-1" } as never);

    const file = new File(["avatar-bytes"], "avatar.png", { type: "image/png" });
    const assetId = await uploadAvatarFile(file);

    expect(assetId).toBe("asset-1");
    expect(initAvatarUpload).toHaveBeenCalledWith({
      filename: "avatar.png",
      mime: "image/png",
      sizeBytes: file.size,
      expectedSha256: null,
    });
    expect(uploadAvatarPart).toHaveBeenCalledTimes(1);
    expect(completeAvatarUpload).toHaveBeenCalledWith("u-1");
    expect(abortAvatarUpload).not.toHaveBeenCalled();
  });

  it("上传失败时执行 abort 清理", async () => {
    vi.mocked(initAvatarUpload).mockResolvedValue({
      uploadId: "u-2",
      chunkSize: 1024,
      totalParts: 1,
      method: "local",
    } as never);
    vi.mocked(uploadAvatarPart).mockRejectedValue(new Error("upload failed"));

    const file = new File(["avatar-bytes"], "avatar.png", { type: "image/png" });

    await expect(uploadAvatarFile(file)).rejects.toThrow("upload failed");
    expect(abortAvatarUpload).toHaveBeenCalledWith("u-2");
    expect(completeAvatarUpload).not.toHaveBeenCalled();
  });

  it("complete 开始后失败时保留同一 uploadId 且不 abort", async () => {
    vi.mocked(initAvatarUpload).mockResolvedValue({
      uploadId: "u-completion",
      chunkSize: 1024,
      totalParts: 1,
      method: "local",
    } as never);
    vi.mocked(uploadAvatarPart).mockResolvedValue(undefined);
    vi.mocked(completeAvatarUpload)
      .mockRejectedValueOnce(new Error("database commit failed"))
      .mockResolvedValueOnce({ assetId: "asset-completed" } as never);

    const file = new File(["avatar-bytes"], "avatar.png", { type: "image/png" });

    let completionError: unknown;
    try {
      await uploadAvatarFile(file);
    } catch (error) {
      completionError = error;
    }

    expect(completionError).toBeInstanceOf(AssetUploadCompletionRequiredError);
    const checkpoint = getAssetUploadCompletionCheckpoint(completionError);
    expect(checkpoint).toMatchObject({ uploadId: "u-completion" });
    expect.assert(checkpoint);
    await expect(completeAssetUpload(checkpoint)).resolves.toBe("asset-completed");

    expect(initAvatarUpload).toHaveBeenCalledTimes(1);
    expect(uploadAvatarPart).toHaveBeenCalledTimes(1);
    expect(completeAvatarUpload).toHaveBeenNthCalledWith(1, "u-completion");
    expect(completeAvatarUpload).toHaveBeenNthCalledWith(2, "u-completion");
    expect(abortAvatarUpload).not.toHaveBeenCalled();
  });

  it("pre-completion abort 失败时不会吞掉 cleanup error", async () => {
    const uploadError = new Error("upload failed");
    const cleanupError = new Error("abort failed");
    vi.mocked(initAvatarUpload).mockResolvedValue({
      uploadId: "u-cleanup",
      chunkSize: 1024,
      totalParts: 1,
      method: "local",
    } as never);
    vi.mocked(uploadAvatarPart).mockRejectedValue(uploadError);
    vi.mocked(abortAvatarUpload).mockRejectedValue(cleanupError);

    const file = new File(["avatar-bytes"], "avatar.png", { type: "image/png" });

    await expect(uploadAvatarFile(file)).rejects.toEqual(
      expect.objectContaining<Partial<AssetUploadCleanupError>>({
        uploadId: "u-cleanup",
        uploadError,
        cleanupError,
      }),
    );
    expect(completeAvatarUpload).not.toHaveBeenCalled();
  });

  it("s3 multipart 模式会先 presign 再 commit", async () => {
    vi.mocked(initAvatarUpload).mockResolvedValue({
      uploadId: "u-3",
      chunkSize: 4,
      totalParts: 2,
      method: "s3_multipart",
    } as never);
    vi.mocked(presignAvatarUploadPart).mockResolvedValue({
      url: "https://example.com/upload",
      method: "PUT",
      headers: { "x-test": "1" },
    } as never);
    vi.mocked(completeAvatarUpload).mockResolvedValue({ assetId: "asset-3" } as never);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200, headers: { ETag: '"etag-value"' } }));

    const file = new File(["abcdefgh"], "avatar.png", { type: "image/png" });
    const assetId = await uploadAvatarFile(file);

    expect(assetId).toBe("asset-3");
    expect(presignAvatarUploadPart).toHaveBeenCalledTimes(2);
    expect(commitAvatarUploadPart).toHaveBeenCalledTimes(2);
    expect(uploadAvatarPart).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("文件超过头像策略大小时不会初始化上传", async () => {
    vi.mocked(getAvatarUploadPolicy).mockResolvedValue({
      purpose: "avatar",
      maxSizeMb: 1,
      maxSizeBytes: 1,
      allowedExtensions: ["png"],
      allowedMimeTypes: ["image/png"],
      accept: ".png,image/png",
    } as never);

    const file = new File(["avatar-bytes"], "avatar.png", { type: "image/png" });

    await expect(uploadAvatarFile(file)).rejects.toThrow("UPLOAD_TOO_LARGE");
    expect(initAvatarUpload).not.toHaveBeenCalled();
    expect(abortAvatarUpload).not.toHaveBeenCalled();
  });

  it("文件类型不在头像策略内时不会初始化上传", async () => {
    vi.mocked(getAvatarUploadPolicy).mockResolvedValue({
      purpose: "avatar",
      maxSizeMb: 10,
      maxSizeBytes: 10 * 1024 * 1024,
      allowedExtensions: ["png"],
      allowedMimeTypes: ["image/png"],
      accept: ".png,image/png",
    } as never);

    const file = new File(["avatar-bytes"], "avatar.gif", { type: "image/gif" });

    await expect(uploadAvatarFile(file)).rejects.toThrow("UPLOAD_TYPE_NOT_ALLOWED");
    expect(initAvatarUpload).not.toHaveBeenCalled();
    expect(abortAvatarUpload).not.toHaveBeenCalled();
  });
});
