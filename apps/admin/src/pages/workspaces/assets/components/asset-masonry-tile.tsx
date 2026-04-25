import { memo, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { type AdminAssetTag } from "@/types/api";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Button } from "@arclayer/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@arclayer/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
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
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { formatRelativeTime } from "@/lib/time/relative-time";
import { LazyAssetImage } from "./lazy-asset-image";
import type { AssetMoreActionKey, AssetMoreMenuItem } from "./asset-more-actions";

const TILE_ACTION_BUTTON_CLASSNAME =
  "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] hover:bg-white/16 hover:text-white focus-visible:bg-white/16 focus-visible:text-white";

const TILE_ACTION_CHECKBOX_SHELL_CLASSNAME =
  "flex size-8 items-center justify-center rounded-r-md bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition-colors hover:bg-white/16";

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
    selectionAffordance?: "checkbox" | "tile";
    onToggleSelected?: (id: string) => void;
    onSelect: (e: React.MouseEvent<HTMLDivElement>) => void;
    onOpen: (asset: AssetMasonryItem) => void;
    onAspectRatio?: (id: string, aspectRatio: number) => void;
    moreMenuItems?: AssetMoreMenuItem[];
    onMoreAction?: (key: AssetMoreActionKey, asset: AssetMasonryItem) => void;
    onEdit?: (asset: AssetMasonryItem) => void;
    onDelete?: (asset: AssetMasonryItem) => void;
    dragHandle?: {
      setNodeRef: (node: HTMLElement | null) => void;
      setActivatorNodeRef?: (node: HTMLElement | null) => void;
      listeners: Record<string, unknown>;
      attributes: Record<string, unknown>;
      isDragging: boolean;
    };
  }) {
    const { t } = useTranslation();
    const aspectRatio = getSafeAspectRatio(props.asset.aspectRatio);
    const selected = Boolean(props.selected);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const hasPreview = Boolean(props.asset.previewUrl);
    const [previewFailed, setPreviewFailed] = useState(false);
    const titleId = useId();
    const selectionAffordance = props.selectionAffordance ?? "checkbox";
    const showSelectionCheckbox = selectionAffordance === "checkbox";
    const showActionToolbar = !previewFailed;
    const overlayVisible = showActionToolbar && (selected || moreMenuOpen);

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
    const stopTileActionEvent = (event: Event | React.SyntheticEvent) => {
      event.stopPropagation();
    };

    return (
      <div
        ref={props.dragHandle?.setNodeRef}
        {...props.dragHandle?.attributes}
        {...props.dragHandle?.listeners}
        className={cn(
          "group relative w-full overflow-hidden bg-card",
          "rounded-none",
          " transition-[box-shadow,opacity,transform] duration-200 ease-out hover:",
          "cursor-pointer outline-none select-none",
          "scale-100 opacity-100",
          selected && "border-primary/80",
          props.dragHandle?.isDragging && "opacity-60",
        )}
        role="button"
        tabIndex={0}
        data-asset-tile="true"
        data-selected={selected ? "true" : "false"}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          // Selection updates can swap the tile subtree between the two clicks,
          // so rely on click.detail instead of native dblclick synthesis.
          if (event.detail >= 2) {
            event.preventDefault();
            props.onOpen(props.asset);
            return;
          }
          props.onSelect(event);
        }}
      >
        <div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
          {selected ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 rounded-none border-[3px] border-primary/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
              aria-hidden="true"
            />
          ) : null}

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
                <div className="text-caption font-medium opacity-80">
                  {(props.asset.ext || props.asset.mimeType || t("assets:ASSET_FILE_GENERIC"))
                    .toString()
                    .replace(/^\\./, "")}
                </div>
              </div>
            </div>
          )}

          {showActionToolbar ? (
            <div
              className={cn(
                "absolute inset-0",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                "pointer-events-none",
                overlayVisible ? "opacity-100" : undefined,
              )}
            >
              <div className="absolute inset-0 bg-black/35" />

              {props.onEdit ||
              props.onDelete ||
              props.moreMenuItems?.length ||
              showSelectionCheckbox ? (
                <div
                  className={cn(
                    "absolute right-3 top-3 z-10",
                    overlayVisible
                      ? "pointer-events-auto opacity-100"
                      : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
                  )}
                  data-tile-actions-visible={overlayVisible ? "true" : "false"}
                >
                  <ButtonGroup className="overflow-hidden rounded-md border border-white/16 bg-black/55 shadow-sm shadow-black/20">
                    {props.onEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={TILE_ACTION_BUTTON_CLASSNAME}
                        aria-label={t("assets:ASSET_ACTION_EDIT")}
                        onPointerDown={stopTileActionEvent}
                        onClick={(event) => {
                          stopTileActionEvent(event);
                          props.onEdit?.(props.asset);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    ) : null}
                    {props.onDelete ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={TILE_ACTION_BUTTON_CLASSNAME}
                        aria-label={t("assets:ASSET_ACTION_DELETE")}
                        onPointerDown={stopTileActionEvent}
                        onClick={(event) => {
                          stopTileActionEvent(event);
                          props.onDelete?.(props.asset);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                    {props.moreMenuItems?.length ? (
                      <DropdownMenu onOpenChange={setMoreMenuOpen}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={TILE_ACTION_BUTTON_CLASSNAME}
                            aria-label={t("common:MORE")}
                            onPointerDown={stopTileActionEvent}
                            onClick={(event) => {
                              setMoreMenuOpen(true);
                              stopTileActionEvent(event);
                            }}
                          >
                            <EllipsisVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {props.moreMenuItems.map((item, index) =>
                            item.type === "separator" ? (
                              <DropdownMenuSeparator key={`sep:${index}`} />
                            ) : (
                              <DropdownMenuIconItem
                                key={item.key}
                                icon={item.icon}
                                disabled={item.disabled}
                                variant={item.variant === "destructive" ? "destructive" : "default"}
                                onSelect={() => props.onMoreAction?.(item.key, props.asset)}
                              >
                                {item.label}
                              </DropdownMenuIconItem>
                            ),
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                    {showSelectionCheckbox ? (
                      <>
                        {props.onEdit || props.onDelete || props.moreMenuItems?.length ? (
                          <ButtonGroupSeparator className="bg-white/12" />
                        ) : null}
                        <div className={TILE_ACTION_CHECKBOX_SHELL_CLASSNAME}>
                          <Checkbox
                            aria-labelledby={titleId}
                            checked={selected}
                            size="sm"
                            variant="accent"
                            className="border-white/35 bg-transparent text-white data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onCheckedChange={() => props.onToggleSelected?.(props.asset.id)}
                          />
                        </div>
                      </>
                    ) : null}
                  </ButtonGroup>
                </div>
              ) : null}

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
            </div>
          ) : null}
        </div>
      </div>
    );
  },
  (prev, next) => prev.asset === next.asset && prev.selected === next.selected,
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
