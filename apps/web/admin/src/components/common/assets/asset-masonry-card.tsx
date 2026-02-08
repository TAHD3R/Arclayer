import type { InputRef } from "antd";
import {
  Avatar,
  Button,
  Descriptions,
  Dropdown,
  Flex,
  Input,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import type { MenuProps } from "antd";
import {
  Check,
  Download,
  EllipsisVertical,
  ExternalLink,
  ImageOff,
  PencilLine,
  Plus,
  RotateCw,
  Settings2,
} from "lucide-react";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type InfiniteData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import {
  createAssetTag,
  deleteAsset,
  getAssetDetail,
  listAssetTags,
  patchAsset,
  type AdminAssetTag,
  type AdminAssetSummary,
  type PageData,
} from "@/api/assets";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@/components/ui/radix-alert-dialog";
import TrashIcon from "@/components/ui/icons/trash-icon";
import { LoaderOne } from "@/components/ui/loader";
import { SettingActionItem } from "@/components/common/setting-action-item";
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
} from "@/components/ui/file-icons/document-icons";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import { copyToClipboard } from "@/lib/clipboard";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { toShareableAbsoluteUrl } from "@/lib/assets/asset-urls";
import { AssetSharePopover } from "@/components/common/assets/asset-share-popover";
import { UpdateAssetsAccessDialog } from "@/components/common/assets/update-assets-access-dialog";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";

export type AssetMasonryItem = {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  thumbBaseUrl?: string;
  mimeType?: string;
  ext?: string;
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

function findTagIdByName(tags: AdminAssetTag[], name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  for (const t of tags) {
    if ((t.name || "").trim().toLowerCase() === needle) return t.id;
  }
  return null;
}

const tagInputStyle: React.CSSProperties = {
  width: 88,
  height: 22,
  marginInlineEnd: 8,
  verticalAlign: "top",
};

function getSafeAspectRatio(value: number | undefined): number {
  if (!value || Number.isNaN(value) || !Number.isFinite(value)) return 4 / 3;
  return Math.min(3, Math.max(0.5, value));
}

function initialsFromName(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function LazyAssetImage(props: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  rootClassName?: string;
  onLoaded?: (info: { naturalWidth: number; naturalHeight: number; aspectRatio: number }) => void;
  onError?: () => void;
  fit?: "cover" | "contain";
  showErrorOverlay?: boolean;
  errorText?: string;
  retryText?: string;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(Boolean(props.eager));
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    props.eager ? "loading" : "idle",
  );
  const [reloadKey, setReloadKey] = useState(0);

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

  useEffect(() => {
    // src 变化 / 用户重试 => 重新进入 loading。
    if (!shouldLoad) return;
    setStatus("loading");
  }, [props.src, reloadKey, shouldLoad]);

  const showErrorOverlay = Boolean(props.showErrorOverlay);
  const showLoading = status === "loading";
  const showError = status === "error";

  return (
    <div
      ref={rootRef}
      className={cn("absolute inset-0 bg-black/5 dark:bg-white/5", props.rootClassName)}
    >
      {shouldLoad ? (
        <img
          key={`${props.src}:${reloadKey}`}
          src={props.src}
          alt={props.alt}
          draggable={false}
          decoding="async"
          className={cn(
            "absolute inset-0 h-full w-full",
            "block",
            props.fit === "contain" ? "object-contain bg-black/5" : "object-cover",
            showError ? "opacity-0" : undefined,
            props.className,
          )}
          onLoad={(e) => {
            setStatus("loaded");
            const el = e.currentTarget;
            const w = Number(el.naturalWidth || 0);
            const h = Number(el.naturalHeight || 0);
            const ar = w > 0 && h > 0 ? w / h : 4 / 3;
            props.onLoaded?.({ naturalWidth: w, naturalHeight: h, aspectRatio: ar });
          }}
          onError={() => {
            setStatus("error");
            props.onError?.();
          }}
        />
      ) : null}

      {showLoading ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="scale-75 opacity-80">
            <LoaderOne />
          </div>
        </div>
      ) : null}

      {showError ? (
        <div className="absolute inset-0 grid place-items-center bg-muted/25">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="rounded-full bg-background/70 p-3 shadow-sm">
              <ImageOff className="size-5" />
            </div>
            <div className="text-xs">
              {props.errorText || t("assets:ASSET_PREVIEW_LOAD_FAILED")}
            </div>
            {showErrorOverlay ? (
              <Button
                size="small"
                icon={<RotateCw size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setStatus("loading");
                  setReloadKey((v) => v + 1);
                }}
              >
                {props.retryText || t("common:RETRY")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getVisibilityLabel(
  visibility: string | undefined,
  t: (key: string, options?: { ns?: string }) => string,
): string {
  const v = (visibility || "").toLowerCase();
  if (v === "public") return t("assets:ASSET_FILTER_VISIBILITY_PUBLIC");
  if (v === "private") return t("assets:ASSET_FILTER_VISIBILITY_PRIVATE");
  if (v === "shared") return t("assets:ASSET_FILTER_VISIBILITY_SHARED");
  return visibility || "-";
}

function getMimeLabel(
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

function getPurposeLabel(
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

function getIndexableLabel(
  indexable: boolean | undefined,
  t: (key: string, options?: { ns?: string }) => string,
): string {
  if (typeof indexable !== "boolean") return "-";
  return indexable ? t("assets:ASSET_INDEXABLE_YES") : t("assets:ASSET_INDEXABLE_NO");
}

function formatCreatedAt(
  iso: string | undefined,
  fallback: string | undefined,
  opts: { locale: string; timezone: string; dateFormat: string | undefined },
): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
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

function buildLinkSnippets(params: { url: string; filename: string; isImage: boolean }) {
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
      if (e.key === "Enter") {
        e.preventDefault();
        props.onOpen(props.asset);
      }
    };

    return (
      <motion.div
        ref={props.dragRef}
        className={cn(
          "group relative w-full overflow-hidden border border-border/50 bg-card",
          "rounded-lg",
          "shadow-sm transition duration-200 hover:shadow-md",
          "cursor-pointer outline-none select-none",
          moving ? "pointer-events-none" : null,
        )}
        animate={{
          opacity: moving ? 0 : 1,
          scale: moving ? 0.985 : 1,
        }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        style={{ willChange: "transform, opacity" }}
        role="button"
        tabIndex={0}
        data-asset-tile="true"
        {...(props.dragAttributes as Record<string, unknown>)}
        {...(props.dragListeners as Record<string, unknown>)}
        onKeyDown={onKeyDown}
        onClick={(e) => props.onSelect(e)}
        onDoubleClick={() => props.onOpen(props.asset)}
        onContextMenu={(e) => props.onContextMenu?.(e)}
      >
        <motion.div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
          {/* Top-left: uploader */}
          <div className="absolute left-3 top-3 z-10 pointer-events-none">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-2 py-1",
                "bg-black/45 text-white backdrop-blur-sm",
              )}
            >
              <Avatar
                size={20}
                style={{
                  backgroundColor: "rgba(255,255,255,0.18)",
                  color: "white",
                  flexShrink: 0,
                }}
              >
                {initialsFromName(uploaderLabel)}
              </Avatar>
              <span className="max-w-36 truncate text-xs font-medium">{uploaderLabel}</span>
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
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="opacity-95">{fallbackIcon}</div>
                <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">
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
              <Checkbox
                checked={selected}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => props.onToggleSelected?.(props.asset.id)}
              />
            </div>

            {/* Filename/description at the bottom */}
            {!previewFailed ? (
              <div className="absolute left-3 right-3 bottom-3">
                <motion.div
                  className={cn("font-bold text-lg text-white", "truncate py-2 pr-8")}
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
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    );
  },
  (prev, next) =>
    prev.asset === next.asset && prev.selected === next.selected && prev.moving === next.moving,
);

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
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const uiLocale = usePreferencesStore((s) => s.locale);
  const workspaceLocalization = useWorkspaceLocalization();
  const { token } = theme.useToken();
  const active = props.active;
  const activeAspectRatio = active ? getSafeAspectRatio(active.aspectRatio) : 4 / 3;
  const [previewAspectRatio, setPreviewAspectRatio] = useState<number | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const failedPreviewRef = useRef<Set<string>>(new Set());
  const uploaderName = active?.uploaderName?.trim() || t("assets:ASSET_UPLOADER_UNKNOWN");
  const uploaderAndTimeText = buildUploaderAndTimeText({
    uploaderName,
    createdAtText: active?.createdAtText,
    t,
  });

  const thumbs = useMemo(() => {
    if (!active?.thumbBaseUrl) return [];
    const base = active.thumbBaseUrl;
    const widths = [400, 800, 1200, 1600] as const;
    return widths.map((w) => ({ key: `w${w}`, url: `${base}?w=${w}`, label: `${w}px` }));
  }, [active?.thumbBaseUrl]);

  const isImage = Boolean(active?.mimeType?.startsWith("image/"));

  const detailQuery = useQuery({
    queryKey: ["assets", "detail", workspaceId, active?.id],
    queryFn: async () => {
      if (!active?.id) throw new Error("missing asset id");
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return getAssetDetail(String(workspaceId), active.id);
    },
    enabled: Boolean(workspaceId) && Boolean(active?.id),
    staleTime: 20 * 1000,
  });

  const tagsQuery = useQuery({
    queryKey: ["assets", "tags", workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listAssetTags(String(workspaceId));
    },
    enabled: Boolean(workspaceId),
    staleTime: 60 * 1000,
  });

  const displayVisibility = detailQuery.data?.visibility ?? active?.visibility;
  const displayPurpose = detailQuery.data?.purpose ?? active?.purpose;

  const dateTime = useMemo(
    () => ({
      locale: uiLocale,
      timezone: workspaceLocalization.localization.timezone ?? "Asia/Shanghai",
      dateFormat: workspaceLocalization.localization.dateFormat,
    }),
    [
      uiLocale,
      workspaceLocalization.localization.dateFormat,
      workspaceLocalization.localization.timezone,
    ],
  );

  const canonicalPublicPath = useMemo(() => {
    if (!active?.id) return null;
    return `/assets/${active.id}`;
  }, [active?.id]);

  const publicAbsoluteUrl = useMemo(() => {
    if ((displayVisibility || "").toLowerCase() !== "public") return null;
    if (!canonicalPublicPath) return null;
    return toShareableAbsoluteUrl(canonicalPublicPath);
  }, [canonicalPublicPath, displayVisibility]);

  const linkSnippets = useMemo(() => {
    if (!publicAbsoluteUrl) return null;
    return buildLinkSnippets({
      url: publicAbsoluteUrl,
      filename: active?.name || "asset",
      isImage,
    });
  }, [active?.name, isImage, publicAbsoluteUrl]);

  const moreMenuItems = useMemo<MenuProps["items"]>(() => {
    return [
      {
        key: "download",
        label: t("assets:ASSET_ACTION_DOWNLOAD"),
        icon: <Download size={16} />,
        disabled: !active?.downloadUrl && !active?.contentUrl,
      },
      { type: "divider" },
      {
        key: "copy_link",
        label: t("assets:ASSET_ACTION_COPY_LINK"),
        icon: <ExternalLink size={16} />,
      },
      {
        key: "open_new_tab",
        label: t("assets:ASSET_ACTION_OPEN_IN_NEW_TAB"),
        icon: <ExternalLink size={16} />,
        disabled: !publicAbsoluteUrl,
      },
      { type: "divider" },
      {
        key: "edit_access",
        label: t("assets:ASSET_ACTION_EDIT_ACCESS"),
        icon: <Settings2 size={16} />,
      },
      { type: "divider" },
      {
        key: "delete",
        label: t("assets:ASSET_ACTION_DELETE"),
        icon: <TrashIcon size={16} isHovered />,
        danger: true,
      },
    ];
  }, [active?.contentUrl, active?.downloadUrl, publicAbsoluteUrl, t]);

  const previewCandidates = useMemo(() => {
    if (!isImage) return [];
    const out: string[] = [];
    if (active?.previewUrl) out.push(active.previewUrl);
    // Prefer larger thumbnails as fallback for the main preview.
    for (const th of [...thumbs].reverse()) out.push(th.url);
    // Avoid using stale public URLs when the asset was just switched to non-public.
    if ((displayVisibility || "").toLowerCase() === "public" && active?.publicUrl)
      out.push(active.publicUrl);
    // Deduplicate while preserving order.
    return Array.from(new Set(out.filter(Boolean)));
  }, [active?.previewUrl, active?.publicUrl, displayVisibility, isImage, thumbs]);

  useEffect(() => {
    failedPreviewRef.current = new Set();
    setPreviewSrc(previewCandidates[0] || null);
    setPreviewAspectRatio(null);
  }, [active?.id, previewCandidates]);

  const initializedIdRef = useRef<string | null>(null);
  const dirtyRef = useRef<{ description: boolean; tags: boolean }>({
    description: false,
    tags: false,
  });
  const debounceTimerRef = useRef<number | null>(null);

  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [tagIdsDraft, setTagIdsDraft] = useState<string[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [editInputIndex, setEditInputIndex] = useState(-1);
  const [editInputValue, setEditInputValue] = useState("");
  const inputRef = useRef<InputRef>(null);
  const editInputRef = useRef<InputRef>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editAccessOpen, setEditAccessOpen] = useState(false);

  useEffect(() => {
    // When switching assets (or reopening), reset draft states.
    const id = active?.id || null;
    // Force re-initialization once detailQuery has data for the new asset.
    initializedIdRef.current = null;
    dirtyRef.current = { description: false, tags: false };
    setInputVisible(false);
    setInputValue("");
    setEditInputIndex(-1);
    setEditInputValue("");
    setSaveState("idle");
    setDeleteOpen(false);
    setEditAccessOpen(false);

    if (!id) {
      setDescriptionDraft("");
      setTagIdsDraft([]);
      return;
    }

    // Avoid showing stale drafts when switching between assets.
    setDescriptionDraft("");
    setTagIdsDraft([]);
  }, [active?.id]);

  useEffect(() => {
    if (!inputVisible) return;
    inputRef.current?.focus();
  }, [inputVisible]);

  useEffect(() => {
    if (editInputIndex < 0) return;
    editInputRef.current?.focus();
  }, [editInputIndex]);

  useEffect(() => {
    const id = active?.id || null;
    if (!id) return;
    const detail = detailQuery.data;
    if (!detail) return;

    // Only initialize drafts once per asset id (avoid overwriting user's in-progress edits).
    if (initializedIdRef.current !== id) {
      initializedIdRef.current = id;
      dirtyRef.current = { description: false, tags: false };
      setDescriptionDraft(detail.description || "");
      setTagIdsDraft(detail.tags.map((x: AdminAssetTag) => x.id));
      return;
    }

    // If user hasn't touched a field, keep it in sync with server.
    if (!dirtyRef.current.description) setDescriptionDraft(detail.description || "");
    if (!dirtyRef.current.tags) setTagIdsDraft(detail.tags.map((x: AdminAssetTag) => x.id));
  }, [active?.id, detailQuery.data]);

  const patchMutation = useMutation({
    mutationFn: async (payload: { description?: string | null; tagIds?: string[] }) => {
      if (!active?.id) throw new Error("missing asset id");
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchAsset(String(workspaceId), active.id, payload);
    },
    onSuccess: (updated) => {
      setSaveState("saved");
      dirtyRef.current = { description: false, tags: false };
      queryClient.setQueryData(["assets", "detail", workspaceId, active?.id], updated);
      // Lists might not include description/tags today, but keep caches consistent.
      if (workspaceId) queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
      window.setTimeout(() => setSaveState("idle"), 1200);
    },
    onError: () => {
      setSaveState("error");
      notifyErrorText(t("assets:ASSET_SAVE_FAILED"));
      window.setTimeout(() => setSaveState("idle"), 1500);
    },
  });

  const patchAccessMutation = useMutation({
    mutationFn: async (payload: { visibility?: string; purpose?: string }) => {
      if (!active?.id) throw new Error("missing asset id");
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchAsset(String(workspaceId), active.id, payload);
    },
    onSuccess: (updated) => {
      notifySuccessText(t("assets:ASSET_EDIT_ACCESS_SUCCESS"));
      queryClient.setQueryData(["assets", "detail", workspaceId, active?.id], updated);
      // Keep list caches in sync so the masonry tiles reflect the latest access fields immediately.
      queryClient.setQueriesData(
        { queryKey: workspaceId ? ["assets", "list", workspaceId] : ["assets", "list"] },
        (old: unknown): unknown => {
          const data = old as InfiniteData<PageData<AdminAssetSummary>> | undefined;
          if (!data) return old;
          const updatedId = String(updated.id);
          const pages = data.pages.map((page) => {
            const items = page.items.map((row) =>
              String(row.id) === updatedId
                ? {
                    ...row,
                    visibility: updated.visibility ?? row.visibility,
                    purpose: updated.purpose ?? row.purpose,
                  }
                : row,
            );

            // Avoid object spread inside map (oxc no-map-spread) while keeping immutability.
            return Object.assign({}, page, { items });
          });

          return Object.assign({}, data, { pages });
        },
      );
      if (workspaceId) queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
    },
    onError: () => {
      notifyErrorText(t("assets:ASSET_EDIT_ACCESS_FAILED"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!active?.id) throw new Error("missing asset id");
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteAsset(String(workspaceId), active.id);
    },
    onSuccess: () => {
      notifySuccessText(t("assets:ASSET_DELETE_SUCCESS"));
      if (workspaceId) queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
      props.onClose();
    },
    onError: () => {
      notifyErrorText(t("assets:ASSET_DELETE_FAILED"));
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return createAssetTag(String(workspaceId), { name });
    },
    onSuccess: () => {
      if (workspaceId) queryClient.invalidateQueries({ queryKey: ["assets", "tags", workspaceId] });
      notifySuccessText(t("assets:ASSET_TAG_CREATED"));
    },
    onError: () => {
      notifyErrorText(t("assets:ASSET_TAG_CREATE_FAILED"));
    },
  });

  useEffect(() => {
    if (!active?.id) return;
    if (!dirtyRef.current.description && !dirtyRef.current.tags) return;

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    setSaveState("saving");
    debounceTimerRef.current = window.setTimeout(() => {
      const payload: { description?: string | null; tagIds?: string[] } = {};
      if (dirtyRef.current.description) payload.description = descriptionDraft.trim() || null;
      if (dirtyRef.current.tags) payload.tagIds = tagIdsDraft;
      patchMutation.mutate(payload);
    }, 650);

    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [active?.id, descriptionDraft, tagIdsDraft, patchMutation]);

  const allTags = useMemo(() => tagsQuery.data?.items || [], [tagsQuery.data]);
  const detailTags = useMemo(() => detailQuery.data?.tags || [], [detailQuery.data]);

  const selectedTags = useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of allTags) byId.set(t.id, t.name);
    for (const t of detailTags) byId.set(t.id, t.name);

    return tagIdsDraft.map((id) => ({ id, name: byId.get(id) || id })).filter((x) => x.name.trim());
  }, [allTags, detailTags, tagIdsDraft]);

  const ensureTagId = async (name: string): Promise<string | null> => {
    const n = name.trim();
    if (!n) return null;

    const existing = findTagIdByName(allTags, n) || findTagIdByName(detailTags, n);
    if (existing) return existing;

    try {
      const created = await createTagMutation.mutateAsync(n);
      return created.id;
    } catch {
      return null;
    }
  };

  const removeTag = (tagId: string) => {
    dirtyRef.current.tags = true;
    setTagIdsDraft((prev) => prev.filter((id) => id !== tagId));
  };

  const confirmAddTag = async () => {
    const name = inputValue.trim();
    if (!name) {
      setInputVisible(false);
      setInputValue("");
      return;
    }

    const id = await ensureTagId(name);
    if (!id) {
      setInputVisible(false);
      setInputValue("");
      return;
    }

    dirtyRef.current.tags = true;
    setTagIdsDraft((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setInputVisible(false);
    setInputValue("");
  };

  const confirmEditTag = async () => {
    if (editInputIndex < 0 || editInputIndex >= selectedTags.length) {
      setEditInputIndex(-1);
      setEditInputValue("");
      return;
    }

    const old = selectedTags[editInputIndex];
    const nextName = editInputValue.trim();
    if (!nextName) {
      setEditInputIndex(-1);
      setEditInputValue("");
      return;
    }

    const nextId = await ensureTagId(nextName);
    if (!nextId) {
      setEditInputIndex(-1);
      setEditInputValue("");
      return;
    }

    dirtyRef.current.tags = true;
    setTagIdsDraft((prev) => {
      const replaced = prev.map((id) => (id === old.id ? nextId : id));
      // Deduplicate while preserving order.
      return Array.from(new Set(replaced));
    });

    setEditInputIndex(-1);
    setEditInputValue("");
  };

  return (
    <Sheet
      open={Boolean(active)}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) props.onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          // Width: default sheet is 350px; asset detail usually needs more space.
          "w-full sm:w-105 md:w-120",
          "p-0 gap-0 overflow-hidden",
        )}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null;
          // antd Dropdown renders overlay in a Portal. Prevent Radix Sheet from treating it as "outside click".
          if (
            target?.closest(".ant-dropdown") ||
            target?.closest(".ant-dropdown-menu") ||
            target?.closest(".ant-dropdown-menu-root") ||
            target?.closest(".ant-menu") ||
            target?.closest(".rc-dropdown")
          ) {
            e.preventDefault();
          }
        }}
      >
        {active ? (
          <>
            <SheetHeader className="border-b border-border/60 pb-4">
              <div className="flex items-start gap-3">
                <Avatar
                  size={40}
                  style={{
                    backgroundColor: "var(--color-muted)",
                    color: "var(--color-foreground)",
                    flexShrink: 0,
                  }}
                >
                  {initialsFromName(uploaderName)}
                </Avatar>

                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate" title={active.name}>
                    {active.name}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-sm truncate" title={uploaderAndTimeText}>
                    {uploaderAndTimeText}
                  </SheetDescription>
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  <AssetSharePopover
                    workspaceId={workspaceId ? String(workspaceId) : ""}
                    assetId={active.id}
                    disabled={!workspaceId}
                  />

                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    // Match the proven pattern used in AssetSharePopover:
                    // avoid rendering overlay into body (Portal) which can be treated as "outside interaction" by Radix.
                    getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
                    menu={{
                      items: moreMenuItems,
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation();

                        if (key === "download") {
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
                          return;
                        }

                        if (key === "copy_link") {
                          const url = publicAbsoluteUrl;
                          if (!url) {
                            notifyErrorText(t("assets:ASSET_SHARE_REQUIRES_PUBLIC"));
                            return;
                          }
                          copyToClipboard(url)
                            .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                            .catch(() => notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")));
                          return;
                        }

                        if (key === "open_new_tab") {
                          if (!publicAbsoluteUrl) return;
                          window.open(publicAbsoluteUrl, "_blank", "noopener,noreferrer");
                          return;
                        }

                        if (key === "edit_access") {
                          setEditAccessOpen(true);
                          return;
                        }

                        if (key === "delete") {
                          setDeleteOpen(true);
                        }
                      },
                    }}
                  >
                    <Button
                      type="text"
                      icon={<EllipsisVertical size={18} />}
                      style={{ width: 36, height: 36, paddingInline: 0 }}
                    />
                  </Dropdown>
                </div>
              </div>

              <Typography.Paragraph
                className="w-full !mb-0 text-muted-foreground"
                ellipsis={{
                  rows: 2,
                  expandable: true,
                  symbol: t("assets:ASSET_DESCRIPTION_MORE"),
                }}
                editable={{
                  icon: <PencilLine size={16} />,
                  tooltip: t("assets:ASSET_DESCRIPTION_EDIT_TOOLTIP"),
                  enterIcon: <Check size={16} />,
                  text: descriptionDraft,
                  onChange: (val) => {
                    dirtyRef.current.description = true;
                    setDescriptionDraft(val);
                  },
                  autoSize: { minRows: 2, maxRows: 6 },
                }}
              >
                {descriptionDraft ? (
                  descriptionDraft
                ) : (
                  <span className="text-muted-foreground/70">
                    {t("assets:ASSET_DESCRIPTION_EMPTY")}
                  </span>
                )}
              </Typography.Paragraph>
            </SheetHeader>

            <UpdateAssetsAccessDialog
              open={editAccessOpen}
              onOpenChange={setEditAccessOpen}
              mode="single"
              currentVisibility={displayVisibility}
              currentPurpose={displayPurpose}
              confirmLoading={patchAccessMutation.isPending}
              onConfirm={async (value) => {
                await patchAccessMutation.mutateAsync(value);
              }}
            />

            <div className="flex-1 overflow-auto">
              <div className="p-4">
                <div className="relative mx-auto overflow-hidden rounded-lg border border-border/60 bg-black/2">
                  <div
                    className="relative w-full"
                    style={{
                      // Keep preview reasonably sized but preserve aspect ratio.
                      aspectRatio: previewAspectRatio
                        ? getSafeAspectRatio(previewAspectRatio)
                        : activeAspectRatio,
                    }}
                  >
                    {previewSrc ? (
                      <LazyAssetImage
                        eager
                        src={previewSrc}
                        alt={active.name}
                        fit="contain"
                        showErrorOverlay
                        errorText={t("assets:ASSET_PREVIEW_LOAD_FAILED")}
                        retryText={t("common:RETRY")}
                        onLoaded={(info) => {
                          setPreviewAspectRatio(info.aspectRatio);
                        }}
                        onError={() => {
                          if (!previewSrc) return;
                          failedPreviewRef.current.add(previewSrc);
                          const next = previewCandidates.find(
                            (u) => !failedPreviewRef.current.has(u),
                          );
                          if (next && next !== previewSrc) {
                            setPreviewSrc(next);
                          } else {
                            notifyErrorText(t("assets:ASSET_PREVIEW_LOAD_FAILED"));
                          }
                        }}
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

                <div className="mt-5 rounded-lg">
                  <Accordion
                    type="multiple"
                    defaultValue={["meta"]}
                    className="border-t border-border/60"
                  >
                    <AccordionItem value="meta">
                      <AccordionTrigger className="py-3">
                        {t("assets:ASSET_META_TITLE")}
                      </AccordionTrigger>
                      <AccordionContent>
                        <Descriptions
                          size="small"
                          layout="vertical"
                          column={2}
                          items={[
                            {
                              key: "mime",
                              label: t("assets:ASSET_META_MIME"),
                              children: (
                                <Tag title={active.mimeType || undefined}>
                                  {getMimeLabel(active.mimeType, t)}
                                </Tag>
                              ),
                            },
                            {
                              key: "size",
                              label: t("assets:ASSET_META_SIZE"),
                              children: active.sizeText || "-",
                            },
                            {
                              key: "createdAt",
                              label: t("assets:ASSET_META_CREATED_AT"),
                              children: formatCreatedAt(
                                active.createdAt,
                                active.createdAtText,
                                dateTime,
                              ),
                            },
                            {
                              key: "visibility",
                              label: t("assets:ASSET_META_VISIBILITY"),
                              children: <Tag>{getVisibilityLabel(displayVisibility, t)}</Tag>,
                            },
                          ]}
                        />

                        <div className="mt-4">
                          <Flex gap="small" align="center" wrap>
                            {selectedTags.map((tag, index) => {
                              if (editInputIndex === index) {
                                return (
                                  <Input
                                    ref={editInputRef}
                                    key={`${tag.id}:edit`}
                                    size="small"
                                    style={tagInputStyle}
                                    value={editInputValue}
                                    onChange={(e) => setEditInputValue(e.target.value)}
                                    onBlur={confirmEditTag}
                                    onPressEnter={confirmEditTag}
                                  />
                                );
                              }

                              const isLongTag = tag.name.length > 20;
                              const tagElem = (
                                <Tag
                                  key={tag.id}
                                  closable
                                  style={{ userSelect: "none" }}
                                  onClose={(e) => {
                                    e.preventDefault();
                                    removeTag(tag.id);
                                  }}
                                >
                                  <span
                                    onDoubleClick={(e) => {
                                      setEditInputIndex(index);
                                      setEditInputValue(tag.name);
                                      e.preventDefault();
                                    }}
                                  >
                                    {isLongTag ? `${tag.name.slice(0, 20)}...` : tag.name}
                                  </span>
                                </Tag>
                              );

                              return isLongTag ? (
                                <Tooltip title={tag.name} key={tag.id}>
                                  {tagElem}
                                </Tooltip>
                              ) : (
                                tagElem
                              );
                            })}

                            {inputVisible ? (
                              <Input
                                ref={inputRef}
                                type="text"
                                size="small"
                                style={tagInputStyle}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onBlur={confirmAddTag}
                                onPressEnter={confirmAddTag}
                              />
                            ) : (
                              <Tag
                                style={{
                                  height: 22,
                                  background: token.colorBgContainer,
                                  borderStyle: "dashed",
                                  cursor: "pointer",
                                }}
                                icon={<Plus size={14} />}
                                onClick={() => setInputVisible(true)}
                              >
                                {t("assets:ASSET_TAG_NEW")}
                              </Tag>
                            )}
                          </Flex>

                          {saveState !== "idle" ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {saveState === "saving"
                                ? t("assets:ASSET_SAVE_SAVING")
                                : saveState === "saved"
                                  ? t("assets:ASSET_SAVE_SAVED")
                                  : saveState === "error"
                                    ? t("assets:ASSET_SAVE_FAILED")
                                    : null}
                            </div>
                          ) : null}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="links">
                      <AccordionTrigger className="py-3">
                        {t("assets:ASSET_LINKS_TITLE")}
                      </AccordionTrigger>
                      <AccordionContent>
                        {linkSnippets ? (
                          <>
                            <div className="mb-2 text-muted-foreground">
                              {t("assets:ASSET_LINKS_DESC")}
                            </div>
                            <div className="rounded-md border border-border/60 overflow-hidden">
                              {(
                                [
                                  {
                                    key: "url",
                                    label: t("assets:ASSET_LINKS_FORMAT_URL"),
                                    value: linkSnippets.url,
                                  },
                                  {
                                    key: "html",
                                    label: t("assets:ASSET_LINKS_FORMAT_HTML"),
                                    value: linkSnippets.html,
                                  },
                                  {
                                    key: "md",
                                    label: t("assets:ASSET_LINKS_FORMAT_MARKDOWN"),
                                    value: linkSnippets.markdown,
                                  },
                                ] as const
                              ).map((row, idx, arr) => (
                                <SettingActionItem
                                  key={row.key}
                                  title={row.label}
                                  titleColumnWidth={110}
                                  titleClassName="text-sm"
                                  showChevron={false}
                                  summary={row.value}
                                  summaryClassName="text-xs font-mono font-normal break-all line-clamp-2"
                                  className={cn(
                                    idx !== arr.length - 1
                                      ? "border-b border-border/60"
                                      : undefined,
                                  )}
                                  onTrigger={() => {
                                    copyToClipboard(row.value)
                                      .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                                      .catch(() =>
                                        notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")),
                                      );
                                  }}
                                />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {t("assets:ASSET_LINKS_REQUIRES_PUBLIC")}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="advanced">
                      <AccordionTrigger className="py-3">
                        {t("assets:ASSET_META_ADVANCED_TITLE")}
                      </AccordionTrigger>
                      <AccordionContent>
                        <Descriptions
                          size="small"
                          layout="vertical"
                          column={2}
                          items={[
                            {
                              key: "purpose",
                              label: t("assets:ASSET_META_PURPOSE"),
                              children: <Tag>{getPurposeLabel(displayPurpose, t)}</Tag>,
                            },
                            {
                              key: "indexable",
                              label: t("assets:ASSET_META_INDEXABLE"),
                              children: <Tag>{getIndexableLabel(active.indexable, t)}</Tag>,
                            },
                            {
                              key: "id",
                              label: t("assets:ASSET_META_ID"),
                              children: (
                                <span className="font-mono text-xs break-all">{active.id}</span>
                              ),
                            },
                            {
                              key: "sha256",
                              label: t("assets:ASSET_META_SHA256"),
                              children: (
                                <span className="font-mono text-xs break-all">
                                  {active.checksumSha256 || "-"}
                                </span>
                              ),
                            },
                          ]}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold! text-xl">
              {t("assets:ASSET_DELETE_CONFIRM_TITLE")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {t("assets:ASSET_DELETE_CONFIRM_DESC")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button type="text" disabled={deleteMutation.isPending}>
                {t("assets:ASSET_DELETE_CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                type="primary"
                danger
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending
                  ? t("assets:ASSET_DELETE_DELETING")
                  : t("assets:ASSET_DELETE_CONFIRM")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
