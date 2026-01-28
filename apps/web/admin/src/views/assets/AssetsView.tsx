import { Masonry } from "antd";
import { LayoutGroup } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/app/defaultPage";
import { LoaderTwo } from "@/components/ui/loader";
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

export function AssetsView() {
  const { t } = useTranslation();
  const layoutIdBase = useId();
  const [active, setActive] = useState<AssetMasonryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const items = useMemo(() => buildMockAssets(), []);
  const [visibleCount, setVisibleCount] = useState(() => Math.min(24, items.length));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (visibleCount >= items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCount((prev) => Math.min(items.length, prev + 24));
      },
      { root: null, rootMargin: "800px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, visibleCount]);

  return (
    <DefaultPage width="full" title={t("common:NAV_ASSETS")}>
      <LayoutGroup id={`asset-library-${layoutIdBase}`}>
        <AssetPreviewOverlay
          active={active}
          layoutIdBase={layoutIdBase}
          onClose={() => setActive(null)}
        />

        <Masonry
          gutter={[16, 16]}
          columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 4 }}
          items={items.slice(0, visibleCount).map((it) => ({ key: it.id, data: it }))}
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

        {visibleCount < items.length ? (
          <div ref={sentinelRef} className="py-8 flex justify-center">
            <LoaderTwo />
          </div>
        ) : null}
      </LayoutGroup>
    </DefaultPage>
  );
}
