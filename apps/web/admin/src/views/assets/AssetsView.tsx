import { Masonry } from "antd";
import { LayoutGroup } from "motion/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/app/defaultPage";
import { LoaderOne } from "@/components/ui/loader";
import { listAdminAssets, type AdminAssetSummary } from "@/api/assets";
import { getAppConfig } from "@/constants/app-config";
import { notifyError } from "@/utils/notifications";
import {
  AssetMasonryTile,
  AssetPreviewOverlay,
  type AssetMasonryItem,
} from "@/views/assets/components/AssetMasonryCard";

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
      description:
        idx % 3 === 0
          ? "这是一个用于联调的示例资源描述。后续会展示分类、标签、描述以及管理操作。"
          : undefined,
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

function toMasonryItem(asset: AdminAssetSummary): AssetMasonryItem {
  const name =
    asset.originalFilename?.trim() ||
    asset.title?.trim() ||
    (asset.slug && asset.ext ? `${asset.slug}.${asset.ext}` : asset.id);

  // Prefer thumbnails for waterfall view to save bandwidth.
  const { apiBaseUrl } = getAppConfig();
  const joinBase = (path: string) => {
    if (!path) return path;
    if (!apiBaseUrl) return path;
    const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  };

  const previewPath = asset.publicThumbUrlPath
    ? `${asset.publicThumbUrlPath}?w=320`
    : asset.publicUrlPath || "";
  const previewUrl = joinBase(previewPath);

  return {
    id: asset.id,
    name,
    description: undefined,
    mimeType: asset.mime || undefined,
    sizeText: formatBytes(asset.sizeBytes),
    createdAtText: asset.createdAt?.slice(0, 10),
    previewUrl: previewUrl || "",
  };
}

export function AssetsView() {
  const { t } = useTranslation();
  const layoutIdBase = useId();
  const [active, setActive] = useState<AssetMasonryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const mockItems = useMemo(() => buildMockAssets(), []);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const assetsQuery = useInfiniteQuery({
    queryKey: ["assets", "list", { purpose: "library", visibility: "public" }],
    queryFn: async ({ pageParam }) =>
      listAdminAssets({
        page: typeof pageParam === "number" ? pageParam : 1,
        size: 24,
        purpose: "library",
        visibility: "public",
        ordering: "-created_at",
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

  const items = useMemo<AssetMasonryItem[]>(() => {
    if (!assetsQuery.data) return mockItems;
    const rows = assetsQuery.data.pages.flatMap((p) => p.items);
    const mapped = rows.map(toMasonryItem).filter((x) => x.previewUrl);
    return mapped.length ? mapped : mockItems;
  }, [assetsQuery.data, mockItems]);

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
    <DefaultPage title={t("common:NAV_ASSETS")}>
      <LayoutGroup id={`asset-library-${layoutIdBase}`}>
        <AssetPreviewOverlay
          active={active}
          layoutIdBase={layoutIdBase}
          onClose={() => setActive(null)}
        />

        <Masonry
          gutter={[16, 16]}
          columns={{ xs: 1, sm: 2, md: 3 }}
          items={items.map((it) => ({ key: it.id, data: it }))}
          itemRender={(info) => (
            <AssetMasonryTile
              asset={info.data}
              layoutIdBase={layoutIdBase}
              selected={selectedIds.has(info.data.id)}
              activeId={active?.id ?? null}
              onToggleSelected={(id) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onOpen={setActive}
            />
          )}
        />

        {assetsQuery.isFetchingNextPage || assetsQuery.hasNextPage ? (
          <div ref={sentinelRef} className="py-8 flex justify-center">
            <LoaderOne />
          </div>
        ) : null}
      </LayoutGroup>
    </DefaultPage>
  );
}
