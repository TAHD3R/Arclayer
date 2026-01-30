import { Alert, Button, Dropdown, Input, Masonry } from "antd";
import { FileText, Music, Package, Plus, Search } from "lucide-react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/app/defaultPage";
import { LoaderOne } from "@/components/ui/loader";
import ChevronDownIcon from "@/components/ui/icons/chevron-down";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@/components/ui/chrome-tabs";
import { cn } from "@/lib/utils";
import {
  listAdminAssetFolders,
  listAdminAssetTags,
  listAdminAssets,
  type AdminAssetFolder,
  type AdminAssetTag,
  type AdminAssetSummary,
} from "@/api/assets";
import { getAppConfig } from "@/constants/app-config";
import { notifyError } from "@/utils/notifications";
import {
  AssetMasonryTile,
  AssetPreviewSheet,
  type AssetMasonryItem,
} from "@/views/assets/components/AssetMasonryCard";
import { resolvePublicAssetUrlPath } from "@/views/assets/utils/assetUrls";
import {
  AssetsFilterPopover,
  type AssetsFilters,
} from "@/views/assets/components/AssetsFilterPopover";
import { AssetUploadDialog } from "@/views/assets/components/AssetUploadDialog";
import type { MenuProps } from "antd";

type MasonryEntry =
  | { kind: "asset"; asset: AssetMasonryItem }
  | { kind: "folder"; folder: AdminAssetFolder }
  | { kind: "folderUp" };

function buildSvgDataUrl({ hue, aspectRatio }: { hue: number; aspectRatio: number }): string {
  // Avoid network dependency for dev: render a simple SVG placeholder as a data URL.
  const width = 1200;
  const height = Math.max(1, Math.round(width / Math.max(0.2, aspectRatio)));
  const bg = `hsl(${hue} 70% 45%)`;
  const bg2 = `hsl(${(hue + 40) % 360} 70% 35%)`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildMockAssets(): AssetMasonryItem[] {
  const aspectRatios = [16 / 9, 4 / 3, 1, 3 / 4, 21 / 9, 5 / 4, 2 / 3] as const;

  return Array.from({ length: 28 }).map((_, idx) => {
    const ar = aspectRatios[idx % aspectRatios.length];
    const name = `Asset ${String(idx + 1).padStart(2, "0")}`;
    const hue = (idx * 37) % 360;
    return {
      id: `mock-${idx + 1}`,
      name,
      description: undefined,
      mimeType: "image/svg+xml",
      sizeText: `${(128 + idx * 13) % 2048} KB`,
      createdAtText: "2026-01-28",
      aspectRatio: ar,
      previewUrl: buildSvgDataUrl({ hue, aspectRatio: ar }),
    };
  });
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

function toMasonryItem(
  asset: AdminAssetSummary,
  opts?: { aspectRatioOverride?: number },
): AssetMasonryItem {
  const name =
    asset.originalFilename?.trim() ||
    asset.title?.trim() ||
    (asset.slug && asset.ext ? `${asset.slug}.${asset.ext}` : asset.id);

  // Prefer thumbnails for waterfall view to save bandwidth.
  // 注意：public `/assets/*` 在 dev 下不应再通过 Vite 代理；这里直接拼出后端绝对 URL。
  // 重要：不要使用后端拼出来的“真实文件名链接”，统一走 canonical 路由：
  // - /assets/<id>（后端会 301 到 /assets/<id>/<slug>.<ext>）
  // - /assets/<id>/thumb?w=xxx
  const canonicalPublicPath = `/assets/${asset.id}`;
  const canonicalThumbBasePath = `/assets/${asset.id}/thumb`;
  const canonicalDownloadPath = `/assets/${asset.id}/download`;

  const thumbBaseUrl = resolvePublicAssetUrlPath(canonicalThumbBasePath);
  const publicUrl =
    asset.visibility === "public" ? resolvePublicAssetUrlPath(canonicalPublicPath) : undefined;
  const previewUrl = thumbBaseUrl ? `${thumbBaseUrl}?w=400` : publicUrl;
  const downloadUrl =
    asset.visibility === "public" ? resolvePublicAssetUrlPath(canonicalDownloadPath) : undefined;

  // Admin content endpoint 走 apiPrefix（可能依赖 Vite proxy 绕过 CORS），所以这里只拼 apiBaseUrl。
  const { apiBaseUrl } = getAppConfig();
  const joinApiBaseUrl = (path: string) => {
    const b = (apiBaseUrl || "").trim();
    if (!b) return path;
    const base = b.endsWith("/") ? b.slice(0, -1) : b;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  };
  const contentUrl = asset.contentUrlPath ? joinApiBaseUrl(asset.contentUrlPath) : undefined;

  return {
    id: asset.id,
    name,
    description: undefined,
    mimeType: asset.mime || undefined,
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
    aspectRatio: opts?.aspectRatioOverride,
  };
}

export function AssetsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<AssetMasonryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const aspectRatioRef = useRef<Map<string, number>>(new Map());
  const [layoutTick, forceLayoutTick] = useState(0);

  // Search / filters / ordering
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AssetsFilters>(() => ({
    // 默认只看 public：瀑布流需要 thumb/public url 才能稳定预览；
    // 其他可见性可通过筛选器切换，但可能只显示“无预览”占位。
    visibility: "public",
  }));
  const [ordering, setOrdering] = useState<string>("-created_at");
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreHovered, setMoreHovered] = useState(false);

  const typeTabValue = useMemo(() => {
    const mp = filters.mimePrefix;
    if (!mp) return "all";
    if (mp === "image/") return "image";
    if (mp === "video/") return "video";
    // Advanced types are represented by the "more" tab (its label changes dynamically).
    return "more";
  }, [filters.mimePrefix]);

  const moreTabLabel = useMemo(() => {
    const mp = filters.mimePrefix;
    if (mp === "audio/") return t("assets:ASSET_FILTER_TYPE_AUDIO");
    if (mp === "text/") return t("assets:ASSET_FILTER_TYPE_TEXT");
    if (mp === "application/") return t("assets:ASSET_FILTER_TYPE_APP");
    return t("assets:ASSET_TYPE_TAB_MORE");
  }, [filters.mimePrefix, t]);

  const moreMenuItems = useMemo<MenuProps["items"]>(
    () => [
      {
        key: "audio",
        icon: <Music size={16} />,
        label: t("assets:ASSET_FILTER_TYPE_AUDIO"),
      },
      {
        key: "text",
        icon: <FileText size={16} />,
        label: t("assets:ASSET_FILTER_TYPE_TEXT"),
      },
      {
        key: "application",
        icon: <Package size={16} />,
        label: t("assets:ASSET_FILTER_TYPE_APP"),
      },
    ],
    [t],
  );

  const mockItems = useMemo(() => buildMockAssets(), []);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const foldersQuery = useQuery({
    queryKey: ["assets", "folders"],
    queryFn: async () => listAdminAssetFolders(),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const tagsQuery = useQuery({
    queryKey: ["assets", "tags"],
    queryFn: async () => listAdminAssetTags(),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const assetsQuery = useInfiniteQuery({
    queryKey: [
      "assets",
      "list",
      {
        purpose: "library",
        q: searchQuery || undefined,
        mimePrefix: filters.mimePrefix,
        folderId: currentFolderId || undefined,
        visibility: filters.visibility,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        tagIds: filters.tagIds,
        ordering,
      },
    ],
    queryFn: async ({ pageParam }) =>
      listAdminAssets({
        page: typeof pageParam === "number" ? pageParam : 1,
        size: 24,
        purpose: "library",
        q: searchQuery || undefined,
        mimePrefix: filters.mimePrefix,
        folderId: currentFolderId || undefined,
        visibility: filters.visibility,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        tagIds: filters.tagIds,
        ordering,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 30 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!assetsQuery.isError) return;
    notifyError(assetsQuery.error);
  }, [assetsQuery.error, assetsQuery.isError]);

  useEffect(() => {
    // Filters changed => selection & active detail should not "stick" to stale items.
    setSelectedIds(new Set());
    setActive(null);
  }, [
    currentFolderId,
    searchQuery,
    filters.mimePrefix,
    filters.visibility,
    filters.createdFrom,
    filters.createdTo,
    filters.tagIds,
    ordering,
  ]);

  const items = useMemo<AssetMasonryItem[]>(() => {
    if (!assetsQuery.data) return mockItems;
    const rows = assetsQuery.data.pages.flatMap((p) => p.items);
    const mapped = rows.map((row) =>
      toMasonryItem(row, { aspectRatioOverride: aspectRatioRef.current.get(row.id) }),
    );
    return mapped.length ? mapped : [];
  }, [assetsQuery.data, mockItems, layoutTick]);

  const folderEntries = useMemo<MasonryEntry[]>(() => {
    const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
    const isRoot = !currentFolderId;

    const visible = folders.filter((f) =>
      isRoot ? !f.parentId : String(f.parentId || "") === String(currentFolderId),
    );

    // Root shows only top-level folders; folder mode shows its immediate children.
    const out: MasonryEntry[] = [];
    if (!isRoot) out.push({ kind: "folderUp" });
    for (const f of visible) out.push({ kind: "folder", folder: f });
    return out;
  }, [currentFolderId, foldersQuery.data]);

  const masonryEntries = useMemo<MasonryEntry[]>(() => {
    return [...folderEntries, ...items.map((asset): MasonryEntry => ({ kind: "asset", asset }))];
  }, [folderEntries, items]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (assetsQuery.hasNextPage !== true) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (assetsQuery.isFetchingNextPage) return;
        assetsQuery.fetchNextPage().catch(() => {});
      },
      { root: null, rootMargin: "800px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [assetsQuery.hasNextPage, assetsQuery.isFetchingNextPage, assetsQuery.fetchNextPage]);

  return (
    <DefaultPage
      title={t("nav:NAV_ASSETS")}
      width="full"
      action={
        <Button type="primary" icon={<Plus size={16} />} onClick={() => setUploadOpen(true)}>
          {t("assets:ASSET_ACTION_UPLOAD")}
        </Button>
      }
      extra={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <ChromeTabs
              value={typeTabValue}
              onValueChange={(next) => {
                if (next === "all") {
                  setFilters((prev) => ({ ...prev, mimePrefix: undefined }));
                  setMoreOpen(false);
                  return;
                }
                if (next === "image") {
                  setFilters((prev) => ({ ...prev, mimePrefix: "image/" }));
                  setMoreOpen(false);
                  return;
                }
                if (next === "video") {
                  setFilters((prev) => ({ ...prev, mimePrefix: "video/" }));
                  setMoreOpen(false);
                  return;
                }
                // "more" is controlled via dropdown menu; clicking it should not change filters.
              }}
            >
              <ChromeTabsList className="w-auto">
                <ChromeTabsTrigger value="all">{t("assets:ASSET_TYPE_TAB_ALL")}</ChromeTabsTrigger>
                <ChromeTabsTrigger value="image">
                  {t("assets:ASSET_FILTER_TYPE_IMAGE")}
                </ChromeTabsTrigger>
                <ChromeTabsTrigger value="video">
                  {t("assets:ASSET_FILTER_TYPE_VIDEO")}
                </ChromeTabsTrigger>

                <Dropdown
                  trigger={["click"]}
                  open={moreOpen}
                  onOpenChange={(open) => setMoreOpen(open)}
                  menu={{
                    items: moreMenuItems,
                    onClick: (info) => {
                      if (info.key === "audio") {
                        setFilters((prev) => ({ ...prev, mimePrefix: "audio/" }));
                        setMoreOpen(false);
                        return;
                      }
                      if (info.key === "text") {
                        setFilters((prev) => ({ ...prev, mimePrefix: "text/" }));
                        setMoreOpen(false);
                        return;
                      }
                      if (info.key === "application") {
                        setFilters((prev) => ({ ...prev, mimePrefix: "application/" }));
                        setMoreOpen(false);
                      }
                    },
                  }}
                >
                  <ChromeTabsTrigger
                    value="more"
                    className="flex items-center gap-1"
                    onMouseEnter={() => setMoreHovered(true)}
                    onMouseLeave={() => setMoreHovered(false)}
                  >
                    <span>{moreTabLabel}</span>
                    <ChevronDownIcon
                      size={16}
                      className="opacity-75"
                      isHovered={moreHovered || moreOpen}
                    />
                  </ChromeTabsTrigger>
                </Dropdown>
              </ChromeTabsList>
            </ChromeTabs>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              allowClear
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("assets:ASSET_SEARCH_PLACEHOLDER")}
              prefix={<Search size={16} className="text-muted-foreground" />}
              style={{ width: 260 }}
            />
            <AssetsFilterPopover
              value={filters}
              onChange={setFilters}
              ordering={ordering}
              onOrderingChange={setOrdering}
              defaultOrdering="-created_at"
              tags={(tagsQuery.data?.items ?? []) as AdminAssetTag[]}
              tagsLoading={tagsQuery.isLoading}
            />
          </div>
        </div>
      }
    >
      <AssetPreviewSheet active={active} onClose={() => setActive(null)} />
      <AssetUploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
        }}
        defaultFolderId={currentFolderId || undefined}
        onUploaded={() => {
          // 上传成功后刷新列表；避免 refetch 当前页导致旧的 infinite pages 不一致，直接 invalidate 最稳。
          void queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
          setUploadOpen(false);
        }}
      />

      {assetsQuery.isLoading && !assetsQuery.data ? (
        <div className="py-10 flex justify-center">
          <LoaderOne />
        </div>
      ) : assetsQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message={t("common:REQUEST_FAILED")}
          description={t("assets:ASSET_LIST_LOAD_FAILED_DESC")}
          action={<Button onClick={() => void assetsQuery.refetch()}>{t("common:REFRESH")}</Button>}
        />
      ) : masonryEntries.length === 0 ? (
        <div className="py-10 text-sm text-muted-foreground">{t("assets:ASSET_EMPTY")}</div>
      ) : (
        <Masonry
          gutter={[16, 16]}
          columns={{ xs: 1, sm: 2, md: 3, lg: 4 }}
          fresh
          items={masonryEntries.map((it) => ({
            key:
              it.kind === "asset"
                ? it.asset.id
                : it.kind === "folder"
                  ? `folder:${it.folder.id}`
                  : "folder:__up__",
            data: it,
          }))}
          itemRender={(info) => {
            const entry = info.data as MasonryEntry;
            return entry.kind === "asset" ? (
              <AssetMasonryTile
                asset={entry.asset}
                selected={selectedIds.has(entry.asset.id)}
                onToggleSelected={(id) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onAspectRatio={(id, ar) => {
                  const safe = Number.isFinite(ar) && ar > 0.05 ? ar : 4 / 3;
                  const prev = aspectRatioRef.current.get(id);
                  if (prev && Math.abs(prev - safe) < 0.02) return;
                  aspectRatioRef.current.set(id, safe);
                  // 触发重新渲染，让 `toMasonryItem` 读到最新 aspectRatio。
                  forceLayoutTick((v) => v + 1);
                }}
                onOpen={setActive}
              />
            ) : entry.kind === "folderUp" ? (
              <div
                role="button"
                tabIndex={0}
                className="group relative w-full overflow-hidden border border-border/50 bg-card cursor-pointer outline-none"
                onClick={() => {
                  setFocusedFolderId("__up__");
                  setSelectedIds(new Set());
                  setActive(null);
                }}
                onDoubleClick={() => {
                  const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
                  const cur = folders.find((f) => f.id === currentFolderId);
                  setCurrentFolderId(cur?.parentId ? String(cur.parentId) : null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
                  const cur = folders.find((f) => f.id === currentFolderId);
                  setCurrentFolderId(cur?.parentId ? String(cur.parentId) : null);
                }}
              >
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: 4 / 3 }}>
                  <div className="absolute inset-0 grid place-items-center bg-muted/20">
                    <div className="text-sm font-bold text-muted-foreground">
                      {t("common:BACK")}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "group relative w-full overflow-hidden border border-border/50 bg-card cursor-pointer outline-none",
                  focusedFolderId === entry.folder.id ? "ring-1 ring-foreground/60" : undefined,
                )}
                onClick={() => {
                  setFocusedFolderId(entry.folder.id);
                  setSelectedIds(new Set());
                  setActive(null);
                }}
                onDoubleClick={() => {
                  setCurrentFolderId(entry.folder.id);
                  setFocusedFolderId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  setCurrentFolderId(entry.folder.id);
                  setFocusedFolderId(null);
                }}
              >
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: 4 / 3 }}>
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/20 p-4">
                    <div className="text-center">
                      <div
                        className="text-base font-bold truncate max-w-[12rem]"
                        title={entry.folder.name}
                      >
                        {entry.folder.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t("assets:ASSET_FOLDER")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
        />
      )}

      {assetsQuery.isFetchingNextPage || assetsQuery.hasNextPage ? (
        <div ref={sentinelRef} className="py-8 flex justify-center">
          <LoaderOne />
        </div>
      ) : null}
    </DefaultPage>
  );
}
