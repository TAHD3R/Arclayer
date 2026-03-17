import { describe, expect, it } from "vitest";

import {
  clearRecentAssetWorkspaceRecords,
  removeRecentAssetRecord,
  resolveRecentAssets,
  touchRecentAssetRecord,
  toRecentAssetSnapshot,
  type RecentAssetRecord,
} from "@/lib/assets/assets-recent";
import type { AssetMasonryItem } from "@/types/assets-masonry";

const baseAsset: AssetMasonryItem = {
  id: "asset-1",
  name: "hero.png",
  mimeType: "image/png",
  sizeText: "18 KB",
  createdAt: "2026-03-17T08:00:00.000Z",
  publicUrl: "/assets/asset-1",
};

describe("assets recent helpers", () => {
  it("keeps a serializable snapshot of the preview asset", () => {
    expect(toRecentAssetSnapshot(baseAsset)).toEqual({
      id: "asset-1",
      name: "hero.png",
      previewUrl: undefined,
      thumbBaseUrl: undefined,
      mimeType: "image/png",
      ext: undefined,
      sizeText: "18 KB",
      createdAtText: undefined,
      aspectRatio: undefined,
      createdAt: "2026-03-17T08:00:00.000Z",
      sizeBytes: undefined,
      checksumSha256: undefined,
      visibility: undefined,
      purpose: undefined,
      indexable: undefined,
      publicUrl: "/assets/asset-1",
      downloadUrl: undefined,
      contentUrl: undefined,
      uploaderName: undefined,
      uploaderAvatarUrl: undefined,
    });
  });

  it("resolves recent assets from the current workspace and prefers live items", () => {
    const records: RecentAssetRecord[] = [
      {
        key: "ws-a:asset-1",
        workspaceId: "ws-a",
        visitedAt: "2026-03-17T09:00:00.000Z",
        asset: {
          ...toRecentAssetSnapshot(baseAsset),
          name: "stale-name.png",
        },
      },
      {
        key: "ws-b:asset-2",
        workspaceId: "ws-b",
        visitedAt: "2026-03-17T08:00:00.000Z",
        asset: {
          id: "asset-2",
          name: "other-workspace.png",
        },
      },
    ];

    const resolved = resolveRecentAssets({
      records,
      items: [baseAsset],
      workspaceId: "ws-a",
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual({
      key: "ws-a:asset-1",
      visitedAt: "2026-03-17T09:00:00.000Z",
      asset: baseAsset,
    });
  });

  it("moves a touched record to the top and keeps the newest snapshot", () => {
    const next = touchRecentAssetRecord(
      [
        {
          key: "ws-a:asset-1",
          workspaceId: "ws-a",
          visitedAt: "2026-03-17T08:00:00.000Z",
          asset: toRecentAssetSnapshot(baseAsset),
        },
      ],
      {
        workspaceId: "ws-a",
        asset: {
          ...toRecentAssetSnapshot(baseAsset),
          name: "hero-updated.png",
        },
        visitedAt: "2026-03-17T10:00:00.000Z",
      },
      8,
    );

    expect(next).toEqual([
      {
        key: "ws-a:asset-1",
        workspaceId: "ws-a",
        visitedAt: "2026-03-17T10:00:00.000Z",
        asset: {
          ...toRecentAssetSnapshot(baseAsset),
          name: "hero-updated.png",
        },
      },
    ]);
  });

  it("removes one recent record or clears one workspace without touching others", () => {
    const records: RecentAssetRecord[] = [
      {
        key: "ws-a:asset-1",
        workspaceId: "ws-a",
        visitedAt: "2026-03-17T09:00:00.000Z",
        asset: toRecentAssetSnapshot(baseAsset),
      },
      {
        key: "ws-b:asset-2",
        workspaceId: "ws-b",
        visitedAt: "2026-03-17T08:00:00.000Z",
        asset: {
          id: "asset-2",
          name: "other-workspace.png",
        },
      },
    ];

    expect(removeRecentAssetRecord(records, "ws-a:asset-1")).toEqual([records[1]]);
    expect(clearRecentAssetWorkspaceRecords(records, "ws-a")).toEqual([records[1]]);
  });
});
