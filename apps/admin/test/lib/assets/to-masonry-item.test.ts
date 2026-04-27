import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({ apiBaseUrl: "http://api.test" }),
}));

import { toMasonryItem } from "@/lib/assets/to-masonry-item";

describe("toMasonryItem", () => {
  test("preserves uploader avatar url for asset cards and preview", () => {
    const item = toMasonryItem({
      id: "asset-1",
      purpose: "avatar",
      visibility: "public",
      indexable: false,
      sizeBytes: 128,
      createdAt: "2026-03-06T12:00:00Z",
      contentUrlPath: "/api/v1/projects/project-1/assets/asset-1/content",
      uploaderName: "Ada Lovelace",
      uploaderAvatarUrl: "/assets/uploader.png",
      mime: "image/png",
      ext: "png",
    } as never);

    expect(item.uploaderName).toBe("Ada Lovelace");
    expect(item.uploaderAvatarUrl).toBe("/assets/uploader.png");
  });

  test("preserves folder id for drag move checks", () => {
    const item = toMasonryItem({
      id: "asset-1",
      purpose: "library",
      visibility: "public",
      indexable: false,
      sizeBytes: 128,
      folderId: "folder-1",
      createdAt: "2026-03-06T12:00:00Z",
      contentUrlPath: "/api/v1/projects/project-1/assets/asset-1/content",
      mime: "image/png",
      ext: "png",
    } as never);

    expect(item.folderId).toBe("folder-1");
  });

  test("uses public thumbnail routes for public images", () => {
    const item = toMasonryItem({
      id: "asset-public",
      purpose: "library",
      visibility: "public",
      indexable: false,
      sizeBytes: 256,
      createdAt: "2026-03-06T12:00:00Z",
      contentUrlPath: "/api/v1/projects/project-1/assets/asset-public/content",
      publicThumbUrlPath: "/assets/asset-public/thumb",
      publicUrlPath: "/assets/asset-public/image.png",
      publicDownloadUrlPath: "/assets/asset-public/download",
      mime: "image/png",
      ext: "png",
    } as never);

    expect(item.thumbBaseUrl).toBe("http://api.test/assets/asset-public/thumb");
    expect(item.previewUrl).toBe("http://api.test/assets/asset-public/thumb?w=400");
    expect(item.publicUrl).toBe("http://api.test/assets/asset-public/image.png");
    expect(item.downloadUrl).toBe("http://api.test/assets/asset-public/download");
    expect(item.contentUrl).toBe(
      "http://api.test/api/v1/projects/project-1/assets/asset-public/content",
    );
  });

  test("prefers direct public URLs for public image previews", () => {
    const item = toMasonryItem({
      id: "asset-direct",
      purpose: "library",
      visibility: "public",
      indexable: false,
      sizeBytes: 256,
      createdAt: "2026-03-06T12:00:00Z",
      contentUrlPath: "/api/v1/projects/project-1/assets/asset-direct/content",
      publicThumbUrlPath: "/assets/asset-direct/thumb",
      publicUrlPath: "/assets/asset-direct/image.png",
      publicDirectUrl: "http://localhost:8000/assets/asset-direct/image.png",
      publicDownloadUrlPath: "/assets/asset-direct/download",
      mime: "image/png",
      ext: "png",
    } as never);

    expect(item.previewUrl).toBe("http://localhost:8000/assets/asset-direct/image.png");
    expect(item.publicUrl).toBe("http://localhost:8000/assets/asset-direct/image.png");
    expect(item.thumbBaseUrl).toBe("http://api.test/assets/asset-direct/thumb");
  });

  test("uses public thumbnail routes for non-image file previews", () => {
    const item = toMasonryItem({
      id: "asset-video",
      purpose: "library",
      visibility: "public",
      indexable: false,
      sizeBytes: 1024,
      createdAt: "2026-03-06T12:00:00Z",
      contentUrlPath: "/api/v1/projects/project-1/assets/asset-video/content",
      publicThumbUrlPath: "/assets/asset-video/thumb",
      publicUrlPath: "/assets/asset-video/video.mp4",
      publicDownloadUrlPath: "/assets/asset-video/download",
      mime: "video/mp4",
      ext: "mp4",
    } as never);

    expect(item.thumbBaseUrl).toBe("http://api.test/assets/asset-video/thumb");
    expect(item.previewUrl).toBe("http://api.test/assets/asset-video/thumb?w=400");
  });

  test("uses admin content route for non-public image previews", () => {
    const item = toMasonryItem({
      id: "asset-private",
      purpose: "library",
      visibility: "private",
      indexable: false,
      sizeBytes: 512,
      createdAt: "2026-03-06T12:00:00Z",
      contentUrlPath: "/api/v1/projects/project-1/assets/asset-private/content",
      publicThumbUrlPath: null,
      publicUrlPath: null,
      publicDownloadUrlPath: null,
      mime: "image/png",
      ext: "png",
    } as never);

    expect(item.thumbBaseUrl).toBeUndefined();
    expect(item.previewUrl).toBe(
      "http://api.test/api/v1/projects/project-1/assets/asset-private/content",
    );
    expect(item.publicUrl).toBeUndefined();
    expect(item.downloadUrl).toBeUndefined();
  });
});
