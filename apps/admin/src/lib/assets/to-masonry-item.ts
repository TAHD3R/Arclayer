import { getAppConfig } from "@/lib/config/app-config";
import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";
import type { AdminAssetDetail, AdminAssetSummary } from "@/types/api";
import type { AssetMasonryItem } from "@/types/assets-masonry";

type AssetSummaryLike = AdminAssetSummary | AdminAssetDetail;

function resolveAltName(asset: AssetSummaryLike): string | undefined {
  if (!("altName" in asset)) return undefined;
  const altName = asset.altName;
  return typeof altName === "string" && altName.trim() ? altName : undefined;
}

function formatBytes(bytes: number | undefined | null): string | undefined {
  if (!bytes || bytes < 0) return undefined;
  const units = ["B", "KB", "MB", "GB"] as const;
  let v = bytes;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  const n = idx === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0);
  return `${n} ${units[idx]}`;
}

/**
 * Map backend asset summary into the Masonry card view model used by both AssetsView and pickers.
 */
export function toMasonryItem(
  asset: AssetSummaryLike,
  opts?: { aspectRatioOverride?: number },
): AssetMasonryItem {
  const name =
    asset.originalFilename?.trim() ||
    asset.title?.trim() ||
    (asset.slug && asset.ext ? `${asset.slug}.${asset.ext}` : asset.id);

  const isImage = Boolean(asset.mime?.startsWith("image/"));
  const thumbBaseUrl =
    isImage && asset.publicThumbUrlPath
      ? resolvePublicAssetUrlPath(asset.publicThumbUrlPath)
      : undefined;
  const publicUrl = asset.publicUrlPath
    ? resolvePublicAssetUrlPath(asset.publicUrlPath)
    : undefined;
  const downloadUrl = asset.publicDownloadUrlPath
    ? resolvePublicAssetUrlPath(asset.publicDownloadUrlPath)
    : undefined;

  // Admin content endpoint uses apiBaseUrl (may depend on Vite proxy), so join with apiBaseUrl explicitly.
  const { apiBaseUrl } = getAppConfig();
  const joinApiBaseUrl = (path: string) => {
    const b = (apiBaseUrl || "").trim();
    if (!b) return path;
    const base = b.endsWith("/") ? b.slice(0, -1) : b;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  };
  const contentUrl = asset.contentUrlPath ? joinApiBaseUrl(asset.contentUrlPath) : undefined;
  const previewUrl = isImage ? (thumbBaseUrl ? `${thumbBaseUrl}?w=400` : contentUrl) : undefined;

  return {
    id: asset.id,
    name,
    description: undefined,
    mimeType: asset.mime || undefined,
    ext: asset.ext || undefined,
    sizeText: formatBytes(asset.sizeBytes),
    createdAtText: asset.createdAt?.slice(0, 10),
    previewUrl,
    thumbBaseUrl,
    createdAt: asset.createdAt,
    sizeBytes: asset.sizeBytes,
    checksumSha256: asset.checksumSha256 || undefined,
    visibility: asset.visibility,
    purpose: asset.purpose,
    indexable: asset.indexable,
    publicUrl,
    downloadUrl,
    contentUrl,
    uploaderName: asset.uploaderName || undefined,
    uploaderAvatarUrl: asset.uploaderAvatarUrl || undefined,
    uploaderEmail: asset.uploaderEmail || undefined,
    altName: resolveAltName(asset),
    aspectRatio: opts?.aspectRatioOverride,
  };
}
