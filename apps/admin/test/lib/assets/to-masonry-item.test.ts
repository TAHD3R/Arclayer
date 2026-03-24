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
      contentUrlPath: "/api/v1/workspaces/ws/assets/asset-1/content",
      uploaderName: "Ada Lovelace",
      uploaderAvatarUrl: "/assets/uploader.png",
      mime: "image/png",
      ext: "png",
    } as never);

    expect(item.uploaderName).toBe("Ada Lovelace");
    expect(item.uploaderAvatarUrl).toBe("/assets/uploader.png");
  });
});
