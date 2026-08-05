import { describe, expect, it } from "vitest";

import {
  clearRecentAssetProjectRecords,
  removeRecentAssetProjectAssetIds,
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

  it("resolves recent assets from the current project and prefers live items", () => {
    const records: RecentAssetRecord[] = [
      {
        key: "project-a:asset-1",
        projectId: "project-a",
        visitedAt: "2026-03-17T09:00:00.000Z",
        asset: {
          ...toRecentAssetSnapshot(baseAsset),
          name: "stale-name.png",
        },
      },
      {
        key: "project-b:asset-2",
        projectId: "project-b",
        visitedAt: "2026-03-17T08:00:00.000Z",
        asset: {
          id: "asset-2",
          name: "other-project.png",
        },
      },
    ];

    const resolved = resolveRecentAssets({
      records,
      items: [baseAsset],
      projectId: "project-a",
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toEqual({
      key: "project-a:asset-1",
      visitedAt: "2026-03-17T09:00:00.000Z",
      asset: baseAsset,
    });
  });

  it("moves a touched record to the top and keeps the newest snapshot", () => {
    const next = touchRecentAssetRecord(
      [
        {
          key: "project-a:asset-1",
          projectId: "project-a",
          visitedAt: "2026-03-17T08:00:00.000Z",
          asset: toRecentAssetSnapshot(baseAsset),
        },
      ],
      {
        projectId: "project-a",
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
        key: "project-a:asset-1",
        projectId: "project-a",
        visitedAt: "2026-03-17T10:00:00.000Z",
        asset: {
          ...toRecentAssetSnapshot(baseAsset),
          name: "hero-updated.png",
        },
      },
    ]);
  });

  it("removes one recent record or clears one project without touching others", () => {
    const records: RecentAssetRecord[] = [
      {
        key: "project-a:asset-1",
        projectId: "project-a",
        visitedAt: "2026-03-17T09:00:00.000Z",
        asset: toRecentAssetSnapshot(baseAsset),
      },
      {
        key: "project-b:asset-2",
        projectId: "project-b",
        visitedAt: "2026-03-17T08:00:00.000Z",
        asset: {
          id: "asset-2",
          name: "other-project.png",
        },
      },
    ];

    expect(removeRecentAssetRecord(records, "project-a:asset-1")).toEqual([records[1]]);
    expect(clearRecentAssetProjectRecords(records, "project-a")).toEqual([records[1]]);
  });

  it("removes deleted asset ids from one project without touching other records", () => {
    const records: RecentAssetRecord[] = [
      {
        key: "project-a:asset-1",
        projectId: "project-a",
        visitedAt: "2026-03-17T09:00:00.000Z",
        asset: toRecentAssetSnapshot(baseAsset),
      },
      {
        key: "project-a:asset-3",
        projectId: "project-a",
        visitedAt: "2026-03-17T08:30:00.000Z",
        asset: {
          id: "asset-3",
          name: "keep-me.png",
        },
      },
      {
        key: "project-b:asset-1",
        projectId: "project-b",
        visitedAt: "2026-03-17T08:00:00.000Z",
        asset: toRecentAssetSnapshot(baseAsset),
      },
    ];

    expect(removeRecentAssetProjectAssetIds(records, "project-a", ["asset-1", "asset-9"])).toEqual([
      records[1],
      records[2],
    ]);
  });
});
