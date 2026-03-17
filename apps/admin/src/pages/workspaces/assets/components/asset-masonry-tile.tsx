import { memo, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UserAvatar } from "@/components/common/entity-avatar";
import { cn } from "@arclayer/lib/utils";
import { type AdminAssetTag } from "@/types/api";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  ExcelDocumentIcon,
  GdocDocumentIcon,
  HtmlDocumentIcon,
  PdfDocumentIcon,
  PptDocumentIcon,
  PsdDocumentIcon,
  TxtDocumentIcon,
  UnknownDocumentIcon,
  VideoDocumentIcon,
  WordDocumentIcon,
  ZipDocumentIcon,
} from "@arclayer/ui/icons/document-icons";
import { useAuthStore } from "@/stores/use-auth-store";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { formatRelativeTime } from "@/lib/time/relative-time";
import { LazyAssetImage } from "./lazy-asset-image";

export function findTagIdByName(tags: AdminAssetTag[], name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  for (const t of tags) {
    if ((t.name || "").trim().toLowerCase() === needle) return t.id;
  }
  return null;
}

export const tagInputStyle: CSSProperties = {
  width: 88,
  height: 22,
  marginInlineEnd: 8,
  verticalAlign: "top",
};

export function getSafeAspectRatio(value: number | undefined): number {
  if (!value || Number.isNaN(value) || !Number.isFinite(value)) return 4 / 3;
  return Math.min(3, Math.max(0.5, value));
}

export function initialsFromName(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

export function getVisibilityLabel(
  visibility: string | undefined,
  t: (key: string, options?: { ns?: string }) => string,
): string {
  const v = (visibility || "").toLowerCase();
  if (v === "public") return t("assets:ASSET_FILTER_VISIBILITY_PUBLIC");
  if (v === "private") return t("assets:ASSET_FILTER_VISIBILITY_PRIVATE");
  if (v === "shared") return t("assets:ASSET_FILTER_VISIBILITY_SHARED");
  return visibility || "-";
}

export function getMimeLabel(
  mime: string | undefined,
  t: (key: string, options?: { ns?: string }) => string,
): string {
  const raw = (mime || "").trim().toLowerCase();
  if (!raw) return t("assets:ASSET_MIME_UNKNOWN");
  if (raw === "image/jpeg") return `JPEG ${t("assets:ASSET_MIME_IMAGE")}`;
  if (raw === "image/png") return `PNG ${t("assets:ASSET_MIME_IMAGE")}`;
  if (raw === "image/webp") return `WebP ${t("assets:ASSET_MIME_IMAGE")}`;
  if (raw === "image/gif") return `GIF ${t("assets:ASSET_MIME_IMAGE")}`;
  if (raw === "image/svg+xml") return `SVG ${t("assets:ASSET_MIME_IMAGE")}`;
  if (raw === "application/pdf") return `PDF ${t("assets:ASSET_MIME_APP")}`;
  if (raw === "video/mp4") return `MP4 ${t("assets:ASSET_MIME_VIDEO")}`;
  if (raw === "audio/mpeg") return `MP3 ${t("assets:ASSET_MIME_AUDIO")}`;

  if (raw.startsWith("image/")) return `${t("assets:ASSET_MIME_IMAGE")} (${raw})`;
  if (raw.startsWith("video/")) return `${t("assets:ASSET_MIME_VIDEO")} (${raw})`;
  if (raw.startsWith("audio/")) return `${t("assets:ASSET_MIME_AUDIO")} (${raw})`;
  if (raw.startsWith("text/")) return `${t("assets:ASSET_MIME_TEXT")} (${raw})`;
  if (raw.startsWith("application/")) return `${t("assets:ASSET_MIME_APP")} (${raw})`;
  return raw;
}

export function getPurposeLabel(
  purpose: string | undefined,
  t: (key: string, options?: { ns?: string }) => string,
): string {
  const p = (purpose || "").trim().toLowerCase();
  if (!p) return "-";
  if (p === "library") return t("assets:ASSET_PURPOSE_LIBRARY");
  if (p === "avatar") return t("assets:ASSET_PURPOSE_AVATAR");
  if (p === "site_logo") return t("assets:ASSET_PURPOSE_SITE_LOGO");
  if (p === "favicon") return t("assets:ASSET_PURPOSE_FAVICON");
  if (p === "attachment") return t("assets:ASSET_PURPOSE_ATTACHMENT");
  if (p === "article_cover") return t("assets:ASSET_PURPOSE_ARTICLE_COVER");
  return purpose || "-";
}

export function getIndexableLabel(
  indexable: boolean | undefined,
  t: (key: string, options?: { ns?: string }) => string,
): string {
  if (typeof indexable !== "boolean") return "-";
  return indexable ? t("assets:ASSET_INDEXABLE_YES") : t("assets:ASSET_INDEXABLE_NO");
}

export function formatCreatedAt(
  iso: string | undefined,
  fallback: string | undefined,
  opts: {
    locale: string;
    timezone: string;
    dateFormat: string | undefined;
    useRelativeDateTime?: boolean;
  },
): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      if (opts.useRelativeDateTime) {
        const relative = formatRelativeTime(d, opts.locale);
        if (relative) return relative;
      }
      return formatDateTimeWithPattern({
        date: d,
        locale: opts.locale,
        timeZone: opts.timezone,
        dateFormat: opts.dateFormat,
        includeTime: true,
      });
    }
  }
  return fallback || "-";
}

export function buildLinkSnippets(params: { url: string; filename: string; isImage: boolean }) {
  const safeName = params.filename || "asset";
  const u = params.url;
  return {
    url: u,
    html: params.isImage
      ? `<img src="${u}" alt="${safeName}" />`
      : `<a href="${u}">${safeName}</a>`,
    markdown: params.isImage ? `![${safeName}](${u})` : `[${safeName}](${u})`,
  };
}

export const AssetMasonryTile = memo(
  function AssetMasonryTile(props: {
    asset: AssetMasonryItem;
    selected?: boolean;
    moving?: boolean;
    onToggleSelected?: (id: string) => void;
    onSelect: (e: React.MouseEvent<HTMLDivElement>) => void;
    onOpen: (asset: AssetMasonryItem) => void;
    onAspectRatio?: (id: string, aspectRatio: number) => void;
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    dragRef?: (node: HTMLDivElement | null) => void;
    dragAttributes?: Record<string, unknown>;
    dragListeners?: Record<string, unknown>;
  }) {
    const { t } = useTranslation();
    const aspectRatio = getSafeAspectRatio(props.asset.aspectRatio);
    const selected = Boolean(props.selected);
    const overlayVisible = selected;
    const hasPreview = Boolean(props.asset.previewUrl);
    const moving = Boolean(props.moving);
    const [previewFailed, setPreviewFailed] = useState(false);
    const uploaderLabel = props.asset.uploaderName?.trim() || t("assets:ASSET_UPLOADER_UNKNOWN");
    const titleId = useId();

    useEffect(() => {
      // When src changes (or tile switches), reset error state.
      setPreviewFailed(false);
    }, [props.asset.previewUrl]);

    const fallbackIcon = useMemo(() => {
      const mime = (props.asset.mimeType || "").toLowerCase();
      const extRaw = (props.asset.ext || props.asset.name.split(".").pop() || "").toLowerCase();
      const ext = extRaw.replace(/[^a-z0-9]/g, "");

      if (mime === "application/pdf" || ext === "pdf") return <PdfDocumentIcon size={56} />;
      if (mime.startsWith("video/") || ext === "mp4" || ext === "mov" || ext === "webm") {
        return <VideoDocumentIcon size={56} />;
      }
      if (mime === "text/plain" || ext === "txt") return <TxtDocumentIcon size={56} />;
      if (mime === "text/html" || ext === "html" || ext === "htm")
        return <HtmlDocumentIcon size={56} />;
      if (ext === "doc" || ext === "docx") return <WordDocumentIcon size={56} />;
      if (ext === "xls" || ext === "xlsx" || ext === "csv") return <ExcelDocumentIcon size={56} />;
      if (ext === "ppt" || ext === "pptx") return <PptDocumentIcon size={56} />;
      if (ext === "psd") return <PsdDocumentIcon size={56} />;
      if (ext === "zip" || ext === "7z" || ext === "rar") return <ZipDocumentIcon size={56} />;
      if (ext === "gdoc") return <GdocDocumentIcon size={56} />;
      return <UnknownDocumentIcon size={56} />;
    }, [props.asset.ext, props.asset.mimeType, props.asset.name]);

    const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        props.onOpen(props.asset);
      }
    };

    return (
      <div
        ref={props.dragRef}
        className={cn(
          "group relative w-full overflow-hidden border border-border/50 bg-card",
          "rounded-lg",
          "shadow-sm transition-[box-shadow,opacity,transform] duration-200 ease-out hover:shadow-md",
          "cursor-pointer outline-none select-none",
          moving ? "scale-[0.985] opacity-0" : "scale-100 opacity-100",
          moving ? "pointer-events-none" : null,
        )}
        role="button"
        tabIndex={0}
        data-asset-tile="true"
        onKeyDown={onKeyDown}
        onClick={(e) => props.onSelect(e)}
        onDoubleClick={(event) => {
          event.preventDefault();
          props.onOpen(props.asset);
        }}
        onContextMenu={(e) => props.onContextMenu?.(e)}
      >
        <div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
          {/* Top-left: uploader */}
          <div className="absolute left-3 top-3 z-10 pointer-events-none">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-2 py-1",
                "bg-black/45 text-white backdrop-blur-sm",
              )}
            >
              <UserAvatar
                name={uploaderLabel}
                assetRef={props.asset.uploaderAvatarUrl}
                size={20}
                style={{
                  backgroundColor: "rgba(255,255,255,0.18)",
                  color: "white",
                  flexShrink: 0,
                }}
              />
              <span className="max-w-36 truncate text-caption font-medium">{uploaderLabel}</span>
            </div>
          </div>

          {hasPreview ? (
            <LazyAssetImage
              src={props.asset.previewUrl as string}
              alt={props.asset.name}
              fit="cover"
              className={cn(
                "transition-transform duration-200 ease-out will-change-transform",
                "group-hover:scale-[1.03]",
              )}
              showErrorOverlay
              errorText={t("assets:ASSET_PREVIEW_LOAD_FAILED")}
              retryText={t("common:RETRY")}
              onLoaded={(info) => {
                setPreviewFailed(false);
                props.onAspectRatio?.(props.asset.id, info.aspectRatio);
              }}
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-muted/20">
              <div className="flex flex-col items-center gap-3 text-label-secondary">
                <div className="opacity-95">{fallbackIcon}</div>
                <div className="text-caption font-medium uppercase opacity-80">
                  {(props.asset.ext || props.asset.mimeType || t("assets:ASSET_FILE_GENERIC"))
                    .toString()
                    .replace(/^\\./, "")}
                </div>
              </div>
            </div>
          )}

          {/* Hover overlays: bottom area for filename */}
          <div
            className={cn(
              "absolute inset-0",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
              "pointer-events-none",
              overlayVisible ? "opacity-100" : undefined,
            )}
          >
            {/* Unified overlay */}
            <div className={cn("absolute inset-0", previewFailed ? "bg-black/0" : "bg-black/35")} />

            {/* Checkbox: show on hover OR selected, so users can multi-select without modifier keys */}
            <div
              className={cn(
                "absolute right-3 top-3 pointer-events-auto transition-opacity duration-150",
                selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t("assets:ASSET_ACTION_MOVE")}
                  className="flex size-7 items-center justify-center rounded-md bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                  {...(props.dragAttributes as Record<string, unknown>)}
                  {...(props.dragListeners as Record<string, unknown>)}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <GripVertical className="size-4" />
                </button>
                <Checkbox
                  aria-labelledby={titleId}
                  checked={selected}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => props.onToggleSelected?.(props.asset.id)}
                />
              </div>
            </div>

            {/* Filename/description at the bottom */}
            {!previewFailed ? (
              <div className="absolute left-3 right-3 bottom-3">
                <div
                  id={titleId}
                  className={cn("text-title3 font-bold text-white", "truncate py-2 pr-8")}
                  title={props.asset.name}
                >
                  {props.asset.name}
                </div>
                {props.asset.description ? (
                  <div className={cn("mt-1 text-footnote text-white/85", "line-clamp-2")}>
                    {props.asset.description}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.asset === next.asset && prev.selected === next.selected && prev.moving === next.moving,
);

export function buildUploaderAndTimeText(params: {
  uploaderName?: string;
  createdAtText?: string;
  t: (key: string, options?: { ns?: string }) => string;
}) {
  const who = params.uploaderName?.trim() || params.t("assets:ASSET_UPLOADER_UNKNOWN");
  const when = params.createdAtText?.trim();
  if (!when) return who;
  return `${who} · ${when}`;
}

export async function downloadWithAuth(params: { url: string; filename: string }) {
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
