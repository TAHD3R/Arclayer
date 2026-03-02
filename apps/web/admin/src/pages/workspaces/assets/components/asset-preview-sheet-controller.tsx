import type { InputRef } from "antd";
import { theme } from "antd";
import { Download, ExternalLink, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type InfiniteData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAssetTag,
  deleteAsset,
  getAssetDetail,
  listAssetTags,
  patchAsset,
} from "@/api/assets";
import type { AdminAssetTag, AdminAssetSummary, PageData } from "@/types/api";
import TrashIcon from "@/components/ui/icons/trash-icon";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { toShareableAbsoluteUrl } from "@/lib/assets/asset-urls";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";

import type { AssetMasonryItem } from "@/types/assets-masonry";
import {
  buildLinkSnippets,
  buildUploaderAndTimeText,
  findTagIdByName,
  getSafeAspectRatio,
} from "./asset-masonry-tile";

export type AssetMoreMenuItem =
  | {
      type: "item";
      key: "download" | "copy_link" | "open_new_tab" | "edit_access" | "delete";
      label: string;
      icon: ReactNode;
      disabled?: boolean;
      variant?: "default" | "destructive";
    }
  | { type: "separator" };

export function useAssetPreviewSheetController(props: {
  active: AssetMasonryItem | null;
  onClose: () => void;
}) {
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
    const direct = (detailQuery.data?.publicDirectUrl || "").trim();
    if (direct) return direct;
    if (!canonicalPublicPath) return null;
    return toShareableAbsoluteUrl(canonicalPublicPath);
  }, [canonicalPublicPath, detailQuery.data?.publicDirectUrl, displayVisibility]);

  const linkSnippets = useMemo(() => {
    if (!publicAbsoluteUrl) return null;
    return buildLinkSnippets({
      url: publicAbsoluteUrl,
      filename: active?.name || "asset",
      isImage,
    });
  }, [active?.name, isImage, publicAbsoluteUrl]);

  const moreMenuItems = useMemo<AssetMoreMenuItem[]>(() => {
    return [
      {
        type: "item",
        key: "download",
        label: t("assets:ASSET_ACTION_DOWNLOAD"),
        icon: <Download size={16} />,
        disabled: !active?.downloadUrl && !active?.contentUrl,
      },
      { type: "separator" },
      {
        type: "item",
        key: "copy_link",
        label: t("assets:ASSET_ACTION_COPY_LINK"),
        icon: <ExternalLink size={16} />,
      },
      {
        type: "item",
        key: "open_new_tab",
        label: t("assets:ASSET_ACTION_OPEN_IN_NEW_TAB"),
        icon: <ExternalLink size={16} />,
        disabled: !publicAbsoluteUrl,
      },
      { type: "separator" },
      {
        type: "item",
        key: "edit_access",
        label: t("assets:ASSET_ACTION_EDIT_ACCESS"),
        icon: <Settings2 size={16} />,
      },
      { type: "separator" },
      {
        type: "item",
        key: "delete",
        label: t("assets:ASSET_ACTION_DELETE"),
        icon: <TrashIcon size={16} isHovered />,
        variant: "destructive",
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
            const items = page.items.map((row: AdminAssetSummary) =>
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

  return {
    t,
    workspaceId,
    token,
    active,
    activeAspectRatio,
    previewAspectRatio,
    setPreviewAspectRatio,
    previewSrc,
    setPreviewSrc,
    failedPreviewRef,
    uploaderName,
    uploaderAndTimeText,
    thumbs,
    isImage,
    detailQuery,
    tagsQuery,
    displayVisibility,
    displayPurpose,
    dateTime,
    publicAbsoluteUrl,
    linkSnippets,
    moreMenuItems,
    previewCandidates,
    dirtyRef,
    descriptionDraft,
    setDescriptionDraft,
    tagIdsDraft,
    setTagIdsDraft,
    inputVisible,
    setInputVisible,
    inputValue,
    setInputValue,
    editInputIndex,
    setEditInputIndex,
    editInputValue,
    setEditInputValue,
    inputRef,
    editInputRef,
    saveState,
    deleteOpen,
    setDeleteOpen,
    editAccessOpen,
    setEditAccessOpen,
    patchAccessMutation,
    deleteMutation,
    selectedTags,
    removeTag,
    confirmAddTag,
    confirmEditTag,
  };
}
