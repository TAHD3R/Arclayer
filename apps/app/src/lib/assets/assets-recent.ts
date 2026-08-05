import type { AssetMasonryItem } from "@/types/assets-masonry";

export type RecentAssetSnapshot = Pick<
  AssetMasonryItem,
  | "id"
  | "name"
  | "previewUrl"
  | "thumbBaseUrl"
  | "mimeType"
  | "ext"
  | "sizeText"
  | "createdAtText"
  | "aspectRatio"
  | "createdAt"
  | "sizeBytes"
  | "checksumSha256"
  | "visibility"
  | "purpose"
  | "indexable"
  | "publicUrl"
  | "downloadUrl"
  | "contentUrl"
  | "uploaderName"
  | "uploaderAvatarUrl"
>;

export type RecentAssetRecord = {
  key: string;
  projectId: string;
  visitedAt: string;
  asset: RecentAssetSnapshot;
};

export type ResolvedRecentAsset = {
  key: string;
  visitedAt: string;
  asset: AssetMasonryItem;
};

type TouchRecentAssetInput = {
  projectId: string;
  asset: RecentAssetSnapshot;
  visitedAt?: string;
};

export function toRecentAssetSnapshot(asset: AssetMasonryItem): RecentAssetSnapshot {
  return {
    id: asset.id,
    name: asset.name,
    previewUrl: asset.previewUrl,
    thumbBaseUrl: asset.thumbBaseUrl,
    mimeType: asset.mimeType,
    ext: asset.ext,
    sizeText: asset.sizeText,
    createdAtText: asset.createdAtText,
    aspectRatio: asset.aspectRatio,
    createdAt: asset.createdAt,
    sizeBytes: asset.sizeBytes,
    checksumSha256: asset.checksumSha256,
    visibility: asset.visibility,
    purpose: asset.purpose,
    indexable: asset.indexable,
    publicUrl: asset.publicUrl,
    downloadUrl: asset.downloadUrl,
    contentUrl: asset.contentUrl,
    uploaderName: asset.uploaderName,
    uploaderAvatarUrl: asset.uploaderAvatarUrl,
  };
}

export function touchRecentAssetRecord(
  records: RecentAssetRecord[],
  input: TouchRecentAssetInput,
  limit = 8,
): RecentAssetRecord[] {
  const next: RecentAssetRecord = {
    key: `${input.projectId}:${input.asset.id}`,
    projectId: input.projectId,
    visitedAt: input.visitedAt ?? new Date().toISOString(),
    asset: input.asset,
  };

  return [next, ...records.filter((record) => record.key !== next.key)].slice(0, limit);
}

export function removeRecentAssetRecord(
  records: RecentAssetRecord[],
  key: string,
): RecentAssetRecord[] {
  return records.filter((record) => record.key !== key);
}

export function clearRecentAssetProjectRecords(
  records: RecentAssetRecord[],
  projectId: string,
): RecentAssetRecord[] {
  return records.filter((record) => record.projectId !== projectId);
}

export function removeRecentAssetProjectAssetIds(
  records: RecentAssetRecord[],
  projectId: string,
  assetIds: string[],
): RecentAssetRecord[] {
  const ids = new Set(assetIds.map(String));
  if (ids.size === 0) return records;

  return records.filter(
    (record) => record.projectId !== projectId || !ids.has(String(record.asset.id)),
  );
}

export function resolveRecentAssets(params: {
  records: RecentAssetRecord[];
  items: AssetMasonryItem[];
  projectId: string | null;
  limit?: number;
}): ResolvedRecentAsset[] {
  if (!params.projectId) return [];

  const liveById = new Map(params.items.map((item) => [String(item.id), item]));
  const limit = params.limit ?? 6;

  return params.records
    .filter((record) => record.projectId === params.projectId)
    .slice(0, limit)
    .map((record) => ({
      key: record.key,
      visitedAt: record.visitedAt,
      asset: liveById.get(String(record.asset.id)) ?? record.asset,
    }));
}
