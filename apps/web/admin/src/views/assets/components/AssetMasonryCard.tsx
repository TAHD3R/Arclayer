import type { InputRef } from "antd";
import {
  Button,
  Descriptions,
  Flex,
  Image,
  Input,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  Check,
  Download,
  EllipsisVertical,
  ExternalLink,
  PencilLine,
  Plus,
  Share2,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import {
  createAdminAssetTag,
  getAdminAssetDetail,
  listAdminAssetTags,
  patchAdminAsset,
  type AdminAssetTag,
} from "@/api/assets";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
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

const IMAGE_FALLBACK_DATA_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">` +
      `<defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#e5e7eb"/>` +
      `<stop offset="100%" stop-color="#cbd5e1"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="1200" height="900" fill="url(#g)"/>` +
      `</svg>`,
  );

function LazyAssetImage(props: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  rootClassName?: string;
  onLoaded?: () => void;
  onError?: () => void;
  fit?: "cover" | "contain";
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(Boolean(props.eager));

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

  return (
    <div
      ref={rootRef}
      className={cn("absolute inset-0 bg-black/5 dark:bg-white/5", props.rootClassName)}
    >
      {shouldLoad ? (
        <Image
          key={props.src}
          src={props.src}
          alt={props.alt}
          preview={false}
          fallback={IMAGE_FALLBACK_DATA_URL}
          placeholder={
            <div className="absolute inset-0 grid place-items-center">
              <div className="scale-75 opacity-80">
                <LoaderTwo />
              </div>
            </div>
          }
          className={cn(
            "absolute inset-0 h-full w-full",
            // antd Image renders <div class="ant-image"><img class="ant-image-img" /></div>
            // Use a descendant selector to control the inner <img>.
            "[&_.ant-image-img]:h-full [&_.ant-image-img]:w-full",
            props.fit === "contain"
              ? "[&_.ant-image-img]:object-contain [&_.ant-image-img]:bg-black/5"
              : "[&_.ant-image-img]:object-cover",
            props.className,
          )}
          draggable={false}
          // Antd Image doesn't expose native `loading` prop directly in typings.
          // Lazy-load is handled by our IntersectionObserver gating.
          onLoad={() => props.onLoaded?.()}
          onError={() => props.onError?.()}
        />
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

function formatCreatedAt(iso: string | undefined, fallback: string | undefined): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      // Use user's locale/timezone; actual display formatting can be later wired to system settings.
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    }
  }
  return fallback || "-";
}

function toRelativeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    // Already relative (or invalid); keep as-is.
    return url;
  }
}

function toAbsoluteUrl(url: string): string {
  try {
    // Already absolute.
    // eslint-disable-next-line no-new
    new URL(url);
    return url;
  } catch {
    // Best-effort: make it absolute based on current origin.
    if (typeof window === "undefined") return url;
    return new URL(url, window.location.origin).toString();
  }
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
            fit="cover"
            className={cn(
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
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const active = props.active;
  const activeAspectRatio = active ? getSafeAspectRatio(active.aspectRatio) : 4 / 3;
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const failedPreviewRef = useRef<Set<string>>(new Set());
  const previewSelectionRef = useRef<"auto" | "user">("auto");
  const uploaderAndTimeText = buildUploaderAndTimeText({
    uploaderName: active?.uploaderName,
    createdAtText: active?.createdAtText,
    t,
  });

  const thumbs = useMemo(() => {
    if (!active?.thumbBaseUrl) return [];
    const base = active.thumbBaseUrl;
    const widths = [64, 128, 256, 512] as const;
    return widths.map((w) => ({ key: `w${w}`, url: `${base}?w=${w}`, label: `${w}px` }));
  }, [active?.thumbBaseUrl]);

  const isImage = Boolean(active?.mimeType?.startsWith("image/"));

  const thumbRows = useMemo(() => {
    const rows = thumbs.map((x) => ({ key: x.key, url: x.url, label: x.label }));
    if (active?.publicUrl) {
      rows.push({
        key: "original",
        url: active.publicUrl,
        label: t("assets:ASSET_THUMBNAIL_ORIGINAL"),
      });
    }
    return rows;
  }, [active?.publicUrl, t, thumbs]);

  const publicAbsoluteUrl = useMemo(() => {
    if (!active?.publicUrl) return null;
    return toAbsoluteUrl(active.publicUrl);
  }, [active?.publicUrl]);

  const linkSnippets = useMemo(() => {
    if (!publicAbsoluteUrl) return null;
    return buildLinkSnippets({
      url: publicAbsoluteUrl,
      filename: active?.name || "asset",
      isImage,
    });
  }, [active?.name, isImage, publicAbsoluteUrl]);

  const previewCandidates = useMemo(() => {
    const out: string[] = [];
    if (active?.previewUrl) out.push(active.previewUrl);
    // Prefer larger thumbnails as fallback for the main preview.
    for (const th of [...thumbs].reverse()) out.push(th.url);
    if (active?.publicUrl) out.push(active.publicUrl);
    // Deduplicate while preserving order.
    return Array.from(new Set(out.filter(Boolean)));
  }, [active?.previewUrl, active?.publicUrl, thumbs]);

  useEffect(() => {
    failedPreviewRef.current = new Set();
    previewSelectionRef.current = "auto";
    setPreviewSrc(previewCandidates[0] || null);
  }, [active?.id, previewCandidates]);

  const detailQuery = useQuery({
    queryKey: ["assets", "detail", active?.id],
    queryFn: async () => {
      if (!active?.id) throw new Error("missing asset id");
      return getAdminAssetDetail(active.id);
    },
    enabled: Boolean(active?.id),
    staleTime: 20 * 1000,
    retry: 1,
  });

  const tagsQuery = useQuery({
    queryKey: ["assets", "tags"],
    queryFn: async () => listAdminAssetTags(),
    staleTime: 60 * 1000,
    retry: 1,
  });

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
      setTagIdsDraft(detail.tags.map((x) => x.id));
      return;
    }

    // If user hasn't touched a field, keep it in sync with server.
    if (!dirtyRef.current.description) setDescriptionDraft(detail.description || "");
    if (!dirtyRef.current.tags) setTagIdsDraft(detail.tags.map((x) => x.id));
  }, [active?.id, detailQuery.data]);

  const patchMutation = useMutation({
    mutationFn: async (payload: { description?: string | null; tagIds?: string[] }) => {
      if (!active?.id) throw new Error("missing asset id");
      return patchAdminAsset(active.id, payload);
    },
    onSuccess: (updated) => {
      setSaveState("saved");
      dirtyRef.current = { description: false, tags: false };
      queryClient.setQueryData(["assets", "detail", active?.id], updated);
      // Lists might not include description/tags today, but keep caches consistent.
      queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
      window.setTimeout(() => setSaveState("idle"), 1200);
    },
    onError: () => {
      setSaveState("error");
      notifyErrorText(t("assets:ASSET_SAVE_FAILED"));
      window.setTimeout(() => setSaveState("idle"), 1500);
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => createAdminAssetTag({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", "tags"] });
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

  const allTags = useMemo(() => tagsQuery.data || [], [tagsQuery.data]);
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

                  <Typography.Paragraph
                    className="mt-2 !mb-0 text-sm text-muted-foreground"
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

                  <div className="mt-2">
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
                      <Button
                        type="text"
                        size="small"
                        icon={<EllipsisVertical size={18} />}
                        style={{ width: 36, height: 36, paddingInline: 0 }}
                        className="!bg-transparent hover:!bg-accent/40"
                      />
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
                        fit="contain"
                        onError={() => {
                          if (!previewSrc) return;
                          failedPreviewRef.current.add(previewSrc);
                          if (previewSelectionRef.current === "user") {
                            notifyErrorText(t("assets:ASSET_PREVIEW_LOAD_FAILED"));
                            return;
                          }

                          const next = previewCandidates.find(
                            (u) => !failedPreviewRef.current.has(u),
                          );
                          if (next && next !== previewSrc) setPreviewSrc(next);
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
                  <div className="font-bold">{t("assets:ASSET_META_TITLE")}</div>

                  <div className="mt-3">
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
                          children: formatCreatedAt(active.createdAt, active.createdAtText),
                        },
                        {
                          key: "visibility",
                          label: t("assets:ASSET_META_VISIBILITY"),
                          children: <Tag>{getVisibilityLabel(active.visibility, t)}</Tag>,
                        },
                      ]}
                    />
                  </div>

                  <Accordion type="multiple" className="mt-3 border-t border-border/60">
                    {thumbRows.length ? (
                      <AccordionItem value="thumbnails">
                        <AccordionTrigger className="py-3">
                          {t("assets:ASSET_THUMBNAILS_TITLE")}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="grid grid-cols-1 gap-1">
                            {thumbRows.map((row) => (
                              <Button
                                key={row.key}
                                type="text"
                                className={cn(
                                  "!h-auto !p-2 w-full",
                                  "flex items-center justify-start gap-3",
                                  "rounded-md",
                                  previewSrc === row.url
                                    ? "!bg-accent/60 dark:!bg-accent/40"
                                    : "!bg-transparent hover:!bg-accent/40",
                                )}
                                onClick={() => {
                                  previewSelectionRef.current = "user";
                                  setPreviewSrc(row.url);
                                }}
                              >
                                <Image
                                  preview={false}
                                  src={row.url}
                                  alt={active.name}
                                  width={44}
                                  height={44}
                                  fallback={IMAGE_FALLBACK_DATA_URL}
                                  className={cn(
                                    "block shrink-0 overflow-hidden rounded-md border border-border/60",
                                    "[&_.ant-image-img]:h-11 [&_.ant-image-img]:w-11 [&_.ant-image-img]:object-cover",
                                  )}
                                />
                                <div className="min-w-0 flex-1 text-left">
                                  <div className="text-sm font-medium">{row.label}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {toRelativeUrl(row.url)}
                                  </div>
                                </div>
                              </Button>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ) : null}

                    <AccordionItem value="links">
                      <AccordionTrigger className="py-3">
                        {t("assets:ASSET_LINKS_TITLE")}
                      </AccordionTrigger>
                      <AccordionContent>
                        {linkSnippets ? (
                          <div className="rounded-md border border-border/60">
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
                              <Button
                                key={row.key}
                                type="text"
                                className={cn(
                                  "!h-auto !p-3 w-full rounded-none",
                                  "flex items-start justify-between gap-3",
                                  idx !== arr.length - 1 ? "border-b border-border/60" : undefined,
                                )}
                                onClick={() => {
                                  copyToClipboard(row.value)
                                    .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                                    .catch(() =>
                                      notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")),
                                    );
                                }}
                              >
                                <div className="shrink-0 text-xs text-muted-foreground">
                                  {row.label}
                                </div>
                                <div className="min-w-0 flex-1 text-right">
                                  <div className="font-mono text-xs break-all line-clamp-2">
                                    {row.value}
                                  </div>
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {t("assets:ASSET_LINKS_CLICK_TO_COPY")}
                                  </div>
                                </div>
                              </Button>
                            ))}
                          </div>
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
                              key: "id",
                              label: t("assets:ASSET_META_ID"),
                              children: (
                                <span className="font-mono text-xs break-all">{active.id}</span>
                              ),
                            },
                            {
                              key: "purpose",
                              label: t("assets:ASSET_META_PURPOSE"),
                              children: <Tag>{getPurposeLabel(active.purpose, t)}</Tag>,
                            },
                            {
                              key: "indexable",
                              label: t("assets:ASSET_META_INDEXABLE"),
                              children: <Tag>{getIndexableLabel(active.indexable, t)}</Tag>,
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
    </Sheet>
  );
}
