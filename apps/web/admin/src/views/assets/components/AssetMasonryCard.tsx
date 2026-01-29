import { Button, Space, Tag } from "antd";
import { EllipsisVertical } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import TrashIcon from "@/components/ui/icons/trash-icon";
import ExternalLinkIcon from "@/components/ui/icons/external-link-icon";
import { LoaderTwo } from "@/components/ui/loader";
import { useOutsideClick } from "@/hooks/useOutsideClick";

const SHARED_LAYOUT_TRANSITION = {
  type: "tween",
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
} as const;

export type AssetMasonryItem = {
  id: string;
  name: string;
  description?: string;
  previewUrl: string;
  mimeType?: string;
  sizeText?: string;
  createdAtText?: string;
  aspectRatio?: number;

  // Future fields (reserved):
  // - category
  // - tags
  // - description
};

function getSafeAspectRatio(value: number | undefined): number {
  if (!value || Number.isNaN(value) || !Number.isFinite(value)) return 4 / 3;
  return Math.min(3, Math.max(0.5, value));
}

function LazyAssetImage(props: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  rootClassName?: string;
  onLoaded?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(Boolean(props.eager));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (props.eager) {
      setShouldLoad(true);
      return;
    }
    const el = rootRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { root: null, rootMargin: "600px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [props.eager]);

  const showLoader = shouldLoad && !loaded;

  return (
    <div
      ref={rootRef}
      className={cn("absolute inset-0 bg-black/5 dark:bg-white/5", props.rootClassName)}
    >
      {showLoader ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="scale-75 opacity-80">
            <LoaderTwo />
          </div>
        </div>
      ) : null}

      {shouldLoad ? (
        <img
          src={props.src}
          alt={props.alt}
          className={props.className}
          draggable={false}
          loading={props.eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => {
            setLoaded(true);
            props.onLoaded?.();
          }}
          onError={() => {
            setLoaded(true);
          }}
        />
      ) : null}
    </div>
  );
}

export function AssetMasonryTile(props: {
  asset: AssetMasonryItem;
  layoutIdBase: string;
  selected?: boolean;
  activeId?: string | null;
  onToggleSelected?: (id: string) => void;
  onOpen: (asset: AssetMasonryItem) => void;
}) {
  const aspectRatio = getSafeAspectRatio(props.asset.aspectRatio);
  const selected = Boolean(props.selected);
  const overlayVisible = selected;
  const isActive = Boolean(props.activeId && props.activeId === props.asset.id);

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onOpen(props.asset);
    }
  };

  return (
    <motion.div
      layoutId={`asset-card-${props.asset.id}-${props.layoutIdBase}`}
      className={cn(
        "group relative w-full overflow-hidden border border-border/50 bg-card",
        "shadow-sm transition duration-200 hover:shadow-md",
        "cursor-pointer outline-none",
      )}
      transition={{ layout: SHARED_LAYOUT_TRANSITION }}
      // During shared-element transition, hide the origin tile to avoid double-render ghosting.
      style={{
        pointerEvents: isActive ? "none" : undefined,
        visibility: isActive ? "hidden" : "visible",
      }}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => props.onOpen(props.asset)}
    >
      <motion.div
        layoutId={`asset-image-${props.asset.id}-${props.layoutIdBase}`}
        className="relative w-full overflow-hidden"
        style={{ aspectRatio }}
        transition={{ layout: SHARED_LAYOUT_TRANSITION }}
      >
        <LazyAssetImage
          src={props.asset.previewUrl}
          alt={props.asset.name}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            "transition-transform duration-200 ease-out will-change-transform",
            "group-hover:scale-[1.03]",
          )}
        />

        {/* Hover overlays: top area for selection, bottom area for filename */}
        <div
          className={cn(
            "absolute inset-0",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            overlayVisible ? "opacity-100" : undefined,
          )}
        >
          {/* Top gradient + checkbox */}
          <div className="absolute inset-x-0 top-0 h-20 bg-linear-to-b from-black/35 to-transparent">
            <div className="absolute left-3 top-3 pointer-events-auto">
              <Checkbox
                checked={selected}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => props.onToggleSelected?.(props.asset.id)}
              />
            </div>

            <div className="absolute right-3 top-3 pointer-events-auto">
              <Space.Compact size="small">
                <Button
                  variant="outlined"
                  icon={<ExternalLinkIcon size={16} isHovered />}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
                <Button
                  variant="outlined"
                  icon={<TrashIcon size={16} isHovered />}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
                <Button
                  variant="outlined"
                  icon={<EllipsisVertical size={16} />}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              </Space.Compact>
            </div>
          </div>

          {/* Bottom gradient + filename */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/45 to-transparent">
            <div className="absolute left-3 right-3 bottom-3">
              <motion.div
                layoutId={`asset-title-${props.asset.id}-${props.layoutIdBase}`}
                className={cn("font-bold text-white", "truncate")}
                title={props.asset.name}
                transition={{ layout: SHARED_LAYOUT_TRANSITION }}
              >
                {props.asset.name}
              </motion.div>
              {props.asset.description ? (
                <div className={cn("mt-1 text-sm text-white/85", "line-clamp-2")}>
                  {props.asset.description}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AssetPreviewOverlay(props: {
  active: AssetMasonryItem | null;
  layoutIdBase: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    if (!props.active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }

    // Lock scroll without causing layout shift (scrollbar disappears => Masonry reflow => ghosting).
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [props.active, props.onClose]);

  useOutsideClick(ref, () => props.onClose());

  const tags = useMemo(() => ["image", "mock"], []);
  const active = props.active;
  const activeAspectRatio = active ? getSafeAspectRatio(active.aspectRatio) : 4 / 3;
  // Keep preview image reasonably sized in the viewport while preserving its aspect ratio.
  const previewMaxHeightVh = 55;
  const previewMaxWidthVh = `${(previewMaxHeightVh * activeAspectRatio).toFixed(2)}vh`;

  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence initial={false} mode="sync">
      {active ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            key={`asset-preview-backdrop-${active.id}`}
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(4px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            className="absolute inset-0 bg-black/20"
            onClick={() => props.onClose()}
          />

          <div className="absolute inset-0 grid place-items-center px-4">
            <motion.div
              key={`asset-preview-card-wrapper-${active.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <motion.div
                layoutId={`asset-card-${active.id}-${props.layoutIdBase}`}
                ref={ref}
                className={cn(
                  "w-full max-w-180",
                  "max-h-[90vh] overflow-hidden",
                  "flex flex-col",

                  // Match FloatingPanel rhythm: rounded-xl + border-border + shadow-lg.
                  "rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
                )}
                transition={{ layout: SHARED_LAYOUT_TRANSITION }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <motion.div
                  layoutId={`asset-image-${active.id}-${props.layoutIdBase}`}
                  transition={{ layout: SHARED_LAYOUT_TRANSITION }}
                >
                  <div
                    className="relative mx-auto overflow-hidden"
                    // Use min() to cap width by viewport height * aspectRatio, so height never exceeds previewMaxHeightVh.
                    style={{
                      aspectRatio: activeAspectRatio,
                      width: `min(100%, ${previewMaxWidthVh})`,
                    }}
                  >
                    <LazyAssetImage
                      eager
                      src={active.previewUrl}
                      alt={active.name}
                      className="absolute inset-0 h-full w-full object-cover object-center"
                    />
                  </div>
                </motion.div>

                <div className="p-4">
                  <motion.div
                    layoutId={`asset-title-${active.id}-${props.layoutIdBase}`}
                    className="text-2xl font-bold leading-tight"
                    transition={{ layout: SHARED_LAYOUT_TRANSITION }}
                  >
                    {active.name}
                  </motion.div>

                  {active.description ? (
                    <div className="mt-2 text-muted-foreground leading-relaxed">
                      {active.description}
                    </div>
                  ) : null}

                  <div className="mt-1 text-xs text-muted-foreground">
                    {active.sizeText ? <span>{active.sizeText}</span> : null}
                    {active.sizeText && active.createdAtText ? (
                      <span className="mx-2">·</span>
                    ) : null}
                    {active.createdAtText ? <span>{active.createdAtText}</span> : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button size="small">{t("assets:ASSET_ACTION_COPY_LINK")}</Button>
                    <Button size="small" danger>
                      {t("assets:ASSET_ACTION_DELETE")}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    portalTarget,
  );
}
