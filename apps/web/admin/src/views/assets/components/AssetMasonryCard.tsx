import { Button, Space } from "antd";
import { Download, EllipsisVertical, ExternalLink, Share2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import TrashIcon from "@/components/ui/icons/trash-icon";
import ExternalLinkIcon from "@/components/ui/icons/external-link-icon";
import { LoaderTwo } from "@/components/ui/loader";
import { notifyErrorText, notifySuccessText } from "@/utils/notifications";
import { useAuthStore } from "@/stores/useAuthStore";

export type AssetMasonryItem = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  thumbBaseUrl?: string;
  mimeType?: string;
  sizeText?: string;
  createdAtText?: string;
  aspectRatio?: number;
  createdAt?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  visibility?: string;
  purpose?: string;
  indexable?: boolean;
  publicUrl?: string;
  downloadUrl?: string;
  contentUrl?: string;
  uploaderName?: string;

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
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
  onOpen: (asset: AssetMasonryItem) => void;
}) {
  const { t } = useTranslation();
  const aspectRatio = getSafeAspectRatio(props.asset.aspectRatio);
  const selected = Boolean(props.selected);
  const overlayVisible = selected;
  const hasPreview = Boolean(props.asset.previewUrl);

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onOpen(props.asset);
    }
  };

  return (
    <motion.div
      className={cn(
        "group relative w-full overflow-hidden border border-border/50 bg-card",
        "shadow-sm transition duration-200 hover:shadow-md",
        "cursor-pointer outline-none",
      )}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => props.onOpen(props.asset)}
    >
      <motion.div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
        {hasPreview ? (
          <LazyAssetImage
            src={props.asset.previewUrl as string}
            alt={props.asset.name}
            className={cn(
              "absolute inset-0 h-full w-full object-cover",
              "transition-transform duration-200 ease-out will-change-transform",
              "group-hover:scale-[1.03]",
            )}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-muted/30">
            <div className="text-xs text-muted-foreground">
              {props.asset.mimeType?.startsWith("image/")
                ? t("assets:ASSET_PREVIEW_UNAVAILABLE")
                : props.asset.mimeType || t("assets:ASSET_FILE_GENERIC")}
            </div>
          </div>
        )}

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
                className={cn("font-bold text-white", "truncate")}
                title={props.asset.name}
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

function buildUploaderAndTimeText(params: {
  uploaderName?: string;
  createdAtText?: string;
  t: (key: string, options?: { ns?: string }) => string;
}) {
  const who = params.uploaderName?.trim() || params.t("assets:ASSET_UPLOADER_UNKNOWN");
  const when = params.createdAtText?.trim();
  if (!when) return who;
  return `${who} · ${when}`;
}

async function copyToClipboard(text: string) {
  // Clipboard API might be unavailable in some environments; fall back to execCommand.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") throw new Error("clipboard unavailable");
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("copy failed");
}

async function downloadWithAuth(params: { url: string; filename: string }) {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers();
  if (token) headers.set("authorization", token.startsWith("Bearer ") ? token : `Bearer ${token}`);

  const res = await fetch(params.url, { headers });
  if (!res.ok) throw new Error("download failed");
  const blob = await res.blob();

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = params.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 给浏览器一点时间开始读取 objectUrl，避免过早 revoke。
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
}

export function AssetPreviewSheet(props: { active: AssetMasonryItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const active = props.active;
  const activeAspectRatio = active ? getSafeAspectRatio(active.aspectRatio) : 4 / 3;
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const uploaderAndTimeText = buildUploaderAndTimeText({
    uploaderName: active?.uploaderName,
    createdAtText: active?.createdAtText,
    t,
  });

  useEffect(() => {
    setPreviewSrc(active?.previewUrl || active?.publicUrl || null);
  }, [active?.id, active?.previewUrl, active?.publicUrl]);

  const thumbs = useMemo(() => {
    if (!active?.thumbBaseUrl) return [];
    const base = active.thumbBaseUrl;
    const widths = [64, 128, 256, 512] as const;
    return widths.map((w) => ({ key: `w${w}`, url: `${base}?w=${w}`, label: `${w}px` }));
  }, [active?.thumbBaseUrl]);

  return (
    <Sheet
      open={Boolean(active)}
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          // Width: default sheet is 350px; asset detail usually needs more space.
          "w-full sm:w-[420px] md:w-[480px]",
          "p-0 gap-0 overflow-hidden",
        )}
      >
        {active ? (
          <>
            <SheetHeader className="border-b border-border/60">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate" title={active.name}>
                    {active.name}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-sm truncate" title={uploaderAndTimeText}>
                    {uploaderAndTimeText}
                  </SheetDescription>
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  <Button
                    size="small"
                    icon={<Download size={16} />}
                    disabled={!active.downloadUrl && !active.contentUrl}
                    onClick={() => {
                      const publicDownload = active.downloadUrl;
                      if (publicDownload) {
                        window.open(publicDownload, "_blank", "noopener,noreferrer");
                        return;
                      }

                      const contentUrl = active.contentUrl;
                      if (!contentUrl) return;

                      downloadWithAuth({ url: contentUrl, filename: active.name })
                        .then(() => notifySuccessText(t("assets:ASSET_DOWNLOAD_STARTED")))
                        .catch(() => notifyErrorText(t("assets:ASSET_DOWNLOAD_FAILED")));
                    }}
                  >
                    {t("assets:ASSET_ACTION_DOWNLOAD")}
                  </Button>

                  <Button
                    size="small"
                    icon={<Share2 size={16} />}
                    onClick={() => {
                      const url = active.publicUrl;
                      if (!url) {
                        notifyErrorText(t("assets:ASSET_SHARE_REQUIRES_PUBLIC"));
                        return;
                      }
                      copyToClipboard(url)
                        .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                        .catch(() => notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")));
                    }}
                  >
                    {t("assets:ASSET_ACTION_SHARE")}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="small" icon={<EllipsisVertical size={16} />} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={8}>
                      <DropdownMenuItem
                        onSelect={() => {
                          const url = active.publicUrl;
                          if (!url) {
                            notifyErrorText(t("assets:ASSET_SHARE_REQUIRES_PUBLIC"));
                            return;
                          }
                          copyToClipboard(url)
                            .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                            .catch(() => notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")));
                        }}
                      >
                        <ExternalLink className="size-4" />
                        {t("assets:ASSET_ACTION_COPY_LINK")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!active.publicUrl}
                        onSelect={() => {
                          const url = active.publicUrl;
                          if (!url) return;
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <ExternalLink className="size-4" />
                        {t("assets:ASSET_ACTION_OPEN_IN_NEW_TAB")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => {}}>
                        <TrashIcon size={16} isHovered />
                        {t("assets:ASSET_ACTION_DELETE")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-auto">
              <div className="p-4">
                <div className="relative mx-auto overflow-hidden rounded-lg border border-border/60 bg-black/2">
                  <div
                    className="relative w-full"
                    style={{
                      // Keep preview reasonably sized but preserve aspect ratio.
                      aspectRatio: activeAspectRatio,
                    }}
                  >
                    {previewSrc ? (
                      <LazyAssetImage
                        eager
                        src={previewSrc}
                        alt={active.name}
                        className="absolute inset-0 h-full w-full object-contain object-center bg-black/5"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center bg-muted/20">
                        <div className="text-sm text-muted-foreground">
                          {t("assets:ASSET_PREVIEW_UNAVAILABLE")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {thumbs.length ? (
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">
                      {t("assets:ASSET_THUMBNAILS_TITLE")}
                    </div>
                    <div className="mt-2 flex gap-2 overflow-auto pb-1">
                      {thumbs.map((th) => (
                        <button
                          key={th.key}
                          type="button"
                          className={cn(
                            "shrink-0 rounded-md border border-border/60 overflow-hidden",
                            previewSrc === th.url ? "ring-2 ring-primary" : "hover:border-border",
                          )}
                          onClick={() => setPreviewSrc(th.url)}
                          title={th.label}
                        >
                          <img src={th.url} alt={active.name} className="h-14 w-14 object-cover" />
                        </button>
                      ))}
                      {active.publicUrl ? (
                        <button
                          type="button"
                          className={cn(
                            "shrink-0 rounded-md border border-border/60 px-2 text-xs",
                            previewSrc === active.publicUrl
                              ? "ring-2 ring-primary"
                              : "hover:border-border",
                          )}
                          onClick={() => setPreviewSrc(active.publicUrl as string)}
                        >
                          {t("assets:ASSET_THUMBNAIL_ORIGINAL")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {active.description ? (
                  <div className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {active.description}
                  </div>
                ) : null}

                <div className="mt-5 rounded-lg border border-border/60">
                  <div className="px-3 py-2 text-sm font-medium">
                    {t("assets:ASSET_META_TITLE")}
                  </div>
                  <div className="px-3 pb-3 text-sm">
                    <dl className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-muted-foreground">
                          {t("assets:ASSET_META_PUBLIC_URL")}
                        </dt>
                        <dd className="mt-0.5 flex items-center gap-2">
                          <span className="min-w-0 flex-1 font-mono text-xs break-all">
                            {active.publicUrl || "-"}
                          </span>
                          {active.publicUrl ? (
                            <Button
                              size="small"
                              onClick={() => {
                                copyToClipboard(active.publicUrl as string)
                                  .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                                  .catch(() => notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")));
                              }}
                            >
                              {t("assets:ASSET_ACTION_COPY_LINK")}
                            </Button>
                          ) : null}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">{t("assets:ASSET_META_ID")}</dt>
                        <dd className="mt-0.5 font-mono text-xs break-all">{active.id}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">{t("assets:ASSET_META_MIME")}</dt>
                        <dd className="mt-0.5">{active.mimeType || "-"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">{t("assets:ASSET_META_SIZE")}</dt>
                        <dd className="mt-0.5">{active.sizeText || "-"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">
                          {t("assets:ASSET_META_CREATED_AT")}
                        </dt>
                        <dd className="mt-0.5">{active.createdAtText || "-"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">
                          {t("assets:ASSET_META_VISIBILITY")}
                        </dt>
                        <dd className="mt-0.5">{active.visibility || "-"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">{t("assets:ASSET_META_PURPOSE")}</dt>
                        <dd className="mt-0.5">{active.purpose || "-"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">
                          {t("assets:ASSET_META_INDEXABLE")}
                        </dt>
                        <dd className="mt-0.5">
                          {typeof active.indexable === "boolean"
                            ? active.indexable
                              ? t("assets:ASSET_META_YES")
                              : t("assets:ASSET_META_NO")
                            : "-"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">{t("assets:ASSET_META_SHA256")}</dt>
                        <dd className="mt-0.5 font-mono text-xs break-all">
                          {active.checksumSha256 || "-"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
