import { FileText, Music, Package } from "lucide-react";
import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  bulkDeleteAssets,
  bulkMoveAssets,
  bulkUpdateAssets,
  createAssetFolder,
  deleteAssetFolder,
  listAssets,
  updateAssetFolder,
} from "@/api/assets";
import type { PageData, AdminAssetFolder, AdminAssetSummary } from "@/types/api";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { clearSelection, selectOnly, type AssetSelectionState } from "@/lib/assets/asset-selection";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useAssetsExplorerController } from "@/components/assets/explorer/use-assets-explorer-controller";
import type { AssetMasonryItem } from "@/components/assets/asset-masonry-card";
import type { MenuProps } from "antd";
import {
  DND_ROOT_ID,
  parseAssetDndId,
  parseFolderDndId,
  parseFolderItemDndId,
} from "./assets-view-dnd";
export function useAssetsViewController() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const [active, setActive] = useState<AssetMasonryItem | null>(null);
  const [selection, setSelection] = useState<AssetSelectionState>(() => ({
    selectedIds: new Set(),
    lastActiveId: null,
  }));
  const selectedIds = selection.selectedIds;
  const [uploadOpen, setUploadOpen] = useState(false);
  const aspectRatioRef = useRef<Map<string, number>>(new Map());
  const [layoutTick, forceLayoutTick] = useState(0);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [editFolderOpen, setEditFolderOpen] = useState(false);
  const [editFolderTarget, setEditFolderTarget] = useState<AdminAssetFolder | null>(null);
  const [moveFolderOpen, setMoveFolderOpen] = useState(false);
  const [moveFolderTarget, setMoveFolderTarget] = useState<AdminAssetFolder | null>(null);
  const [editAccessOpen, setEditAccessOpen] = useState(false);
  const [editAccessMode, setEditAccessMode] = useState<"single" | "bulk">("bulk");
  const [editAccessCurrent, setEditAccessCurrent] = useState<{
    visibility?: string;
    purpose?: string;
  }>({});
  const [folderNotEmptyInfo, setFolderNotEmptyInfo] = useState<{
    folderName: string;
    hasAssets: boolean;
    hasChildren: boolean;
  } | null>(null);
  const [draggingAssetIds, setDraggingAssetIds] = useState<string[]>([]);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [movingAssetIds, setMovingAssetIds] = useState<Set<string>>(() => new Set());
  const [dropSuccessPulse, setDropSuccessPulse] = useState<{
    droppableId: string;
    nonce: number;
  } | null>(null);
  const explorer = useAssetsExplorerController({
    workspaceId,
    pagination: "infinite",
    purpose: "library",
    // 默认只看 public：瀑布流需要 thumb/public url 才能稳定预览；
    // 其他可见性可通过筛选器切换，但可能只显示“无预览”占位。
    defaultVisibility: "public",
    defaultOrdering: "-created_at",
    aspectRatioById: aspectRatioRef.current,
    layoutTick,
  });
  const {
    searchInput,
    setSearchInput,
    searchQuery,
    setSearchQuery,
    currentFolderId,
    setCurrentFolderId,
    focusedFolderId,
    setFocusedFolderId,
    filters,
    setFilters,
    ordering,
    setOrdering,
    explicitFilterActive,
    foldersQuery,
    tagsQuery,
    assetsListQueryKey,
    infiniteAssetsQuery: assetsQuery,
    items,
    orderedAssetIds,
    masonryEntries,
    folderById,
    folderPath,
  } = explorer;
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
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const bulkMoveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof bulkMoveAssets>[1]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return bulkMoveAssets(String(workspaceId), payload);
    },
    onSuccess: (out) => {
      notifySuccessText(t("assets:ASSET_BULK_MOVE_SUCCESS", { count: out.movedCount }));
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
    },
    onError: (err) => {
      notifyError(err);
      setMovingAssetIds(new Set());
    },
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: (payload: Parameters<typeof bulkDeleteAssets>[1]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return bulkDeleteAssets(String(workspaceId), payload);
    },
    onSuccess: (out) => {
      notifySuccessText(t("assets:ASSET_BULK_DELETE_SUCCESS", { count: out.deletedCount }));
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof bulkUpdateAssets>[1]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return bulkUpdateAssets(String(workspaceId), payload);
    },
    onSuccess: (out) => {
      notifySuccessText(t("assets:ASSET_BULK_EDIT_ACCESS_SUCCESS", { count: out.updatedCount }));
      const updatedIds = new Set(out.updatedAssetIds.map(String));
      const nextVisibility = out.visibility ? String(out.visibility).toLowerCase() : null;
      const nextPurpose = out.purpose ? String(out.purpose).toLowerCase() : null;
      const currentVisibility = filters.visibility
        ? String(filters.visibility).toLowerCase()
        : null;
      const willDisappearFromList =
        (nextVisibility !== null &&
          currentVisibility !== null &&
          nextVisibility !== currentVisibility) ||
        (nextPurpose !== null && nextPurpose !== "library");
      if (updatedIds.size > 0 && (out.visibility || out.purpose)) {
        queryClient.setQueryData(assetsListQueryKey, (old: unknown): unknown => {
          const data = old as InfiniteData<PageData<AdminAssetSummary>> | undefined;
          if (!data) return old;
          const pages = data.pages.map((page) => {
            const items = page.items
              .map((row) =>
                updatedIds.has(String(row.id))
                  ? {
                      ...row,
                      visibility: out.visibility ?? row.visibility,
                      purpose: out.purpose ?? row.purpose,
                    }
                  : row,
              )
              .filter((row) => (willDisappearFromList ? !updatedIds.has(String(row.id)) : true));
            // Avoid object spread inside map (oxc no-map-spread) while keeping immutability.
            return Object.assign({}, page, { items });
          });
          return Object.assign({}, data, { pages });
        });
        setActive((prev) => {
          if (!prev) return prev;
          if (!updatedIds.has(String(prev.id))) return prev;
          if (willDisappearFromList) return null;
          return {
            ...prev,
            visibility: out.visibility ?? prev.visibility,
            purpose: out.purpose ?? prev.purpose,
          };
        });
        if (willDisappearFromList) {
          setSelection((prev) => clearSelection(prev));
        }
      }
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "detail", workspaceId] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const createFolderMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createAssetFolder>[1]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return createAssetFolder(String(workspaceId), payload);
    },
    onSuccess: () => {
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "folders", workspaceId] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const updateFolderMutation = useMutation({
    mutationFn: async (input: {
      folderId: string;
      payload: Parameters<typeof updateAssetFolder>[2];
    }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return updateAssetFolder(String(workspaceId), input.folderId, input.payload);
    },
    onSuccess: () => {
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "folders", workspaceId] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteAssetFolder(String(workspaceId), folderId);
    },
    onSuccess: () => {
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "folders", workspaceId] });
      if (workspaceId)
        void queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  // Note: Do not toast for initial page-load errors.
  // ContentGuard will render a full error UI with details + retry.
  useEffect(() => {
    // Filters changed => selection & active detail should not "stick" to stale items.
    setSelection((prev) => clearSelection(prev));
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
  const openEditAccessDialog = () => {
    const ids = Array.from(selectedIds);
    if (ids.length <= 0) return;
    if (ids.length === 1) {
      const asset = items.find((x) => x.id === ids[0]);
      setEditAccessMode("single");
      setEditAccessCurrent({
        visibility: asset?.visibility,
        purpose: asset?.purpose,
      });
    } else {
      setEditAccessMode("bulk");
      setEditAccessCurrent({});
    }
    setEditAccessOpen(true);
  };
  const createParentLabel = useMemo(() => {
    const pid = createFolderParentId ?? currentFolderId;
    if (!pid) return t("assets:ASSET_BREADCRUMB_ROOT");
    return folderById.get(String(pid))?.name || t("assets:ASSET_BREADCRUMB_ROOT");
  }, [createFolderParentId, currentFolderId, folderById, t]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (assetsQuery.isError) return;
    if (assetsQuery.hasNextPage !== true) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (assetsQuery.isError) return;
        if (assetsQuery.isFetchingNextPage) return;
        assetsQuery.fetchNextPage().catch(() => {});
      },
      { root: null, rootMargin: "800px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    assetsQuery.hasNextPage,
    assetsQuery.isError,
    assetsQuery.isFetchingNextPage,
    assetsQuery.fetchNextPage,
  ]);
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        setSelection((prev) => clearSelection(prev));
        setActive(null);
        setFocusedFolderId(null);
        return;
      }
      if (e.key === "Enter") {
        const id = selection.lastActiveId;
        if (!id) return;
        const asset = items.find((it) => it.id === id);
        if (!asset) return;
        setActive(asset);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, selection.lastActiveId]);
  const openBulkDeleteDialog = () => {
    if (selectedIds.size <= 0) return;
    setBulkDeleteOpen(true);
  };
  const tryDeleteFolder = async (folder: AdminAssetFolder) => {
    try {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
      const hasChildren = folders.some((f) => String(f.parentId || "") === String(folder.id));
      // We don't have counts in folder list; do a cheap existence check by fetching 1 item.
      const page = await listAssets(String(workspaceId), {
        page: 1,
        size: 1,
        folderId: String(folder.id),
      });
      const hasAssets = (page.total || 0) > 0;
      if (hasAssets || hasChildren) {
        setFolderNotEmptyInfo({ folderName: folder.name, hasAssets, hasChildren });
        return;
      }
      // Empty folder => delete directly (no dialog).
      await deleteFolderMutation.mutateAsync(String(folder.id));
      if (String(currentFolderId || "") === String(folder.id)) {
        setCurrentFolderId(folder.parentId ? String(folder.parentId) : null);
      }
    } catch (err) {
      notifyError(err);
    }
  };
  const onDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const folderMoveId = parseFolderItemDndId(activeId);
    if (folderMoveId) {
      setDraggingFolderId(folderMoveId);
      setDraggingAssetIds([]);
      flushSync(() => {
        setFocusedFolderId(folderMoveId);
        setSelection((prev) => clearSelection(prev));
        setActive(null);
      });
      return;
    }
    const assetId = parseAssetDndId(activeId);
    if (!assetId) return;
    setFocusedFolderId(null);
    setDraggingFolderId(null);
    if (!selectedIds.has(assetId)) {
      // Start dragging an unselected asset => select it first.
      flushSync(() => {
        setSelection((prev) => selectOnly(prev, assetId));
      });
      setDraggingAssetIds([assetId]);
      return;
    }
    const ids = Array.from(selectedIds);
    setDraggingAssetIds(ids);
  };
  const onDragCancel = () => {
    setDraggingAssetIds([]);
    setDraggingFolderId(null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    void (async () => {
      const overId = event.over ? String(event.over.id) : "";
      const folderMoveId = parseFolderItemDndId(String(event.active.id));
      const folderId = overId ? parseFolderDndId(overId) : undefined;
      const canMove =
        overId === DND_ROOT_ID || (typeof folderId === "string" && folderId.length > 0);
      // Always clear drag visuals at the end of a drag gesture.
      setDraggingAssetIds([]);
      setDraggingFolderId(null);
      if (!canMove) return;
      const destFolderId = folderId ?? null;
      if (folderMoveId) {
        if (String(destFolderId || "") === String(folderMoveId || "")) return;
        const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
        const childrenByParent = new Map<string, string[]>();
        for (const f of folders) {
          const pid = f.parentId ? String(f.parentId) : "";
          const fid = String(f.id);
          if (!pid) continue;
          childrenByParent.set(pid, [...(childrenByParent.get(pid) || []), fid]);
        }
        const descendants = new Set<string>();
        const stack: string[] = [String(folderMoveId)];
        for (let guard = 0; guard < 5000 && stack.length; guard += 1) {
          const cur = stack.pop();
          if (!cur) continue;
          if (descendants.has(cur)) continue;
          descendants.add(cur);
          const children = childrenByParent.get(cur) || [];
          for (const c of children) stack.push(c);
        }
        if (destFolderId && descendants.has(String(destFolderId))) return;
        const nonce = Date.now();
        setDropSuccessPulse({ droppableId: overId, nonce });
        window.setTimeout(() => {
          setDropSuccessPulse((prev) => (prev?.nonce === nonce ? null : prev));
        }, 300);
        await updateFolderMutation.mutateAsync({
          folderId: String(folderMoveId),
          payload: { parentId: destFolderId },
        });
        return;
      }
      if (String(destFolderId || "") === String(currentFolderId || "")) return;
      const assetIds = Array.from(selectedIds);
      if (!assetIds.length) return;
      const nonce = Date.now();
      setDropSuccessPulse({ droppableId: overId, nonce });
      window.setTimeout(() => {
        setDropSuccessPulse((prev) => (prev?.nonce === nonce ? null : prev));
      }, 300);
      setMovingAssetIds(new Set(assetIds));
      // Clear selection immediately; items will fade out before list refresh.
      setSelection((prev) => clearSelection(prev));
      setActive(null);
      await bulkMoveMutation.mutateAsync({ assetIds, folderId: destFolderId });
      // Keep them hidden a bit longer to avoid flicker if the list hasn't refreshed yet.
      window.setTimeout(() => setMovingAssetIds(new Set()), 350);
    })();
  };
  return {
    t,
    queryClient,
    workspaceId,
    active,
    setActive,
    selection,
    setSelection,
    selectedIds,
    uploadOpen,
    setUploadOpen,
    aspectRatioRef,
    forceLayoutTick,
    moveModalOpen,
    setMoveModalOpen,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    createFolderOpen,
    setCreateFolderOpen,
    createFolderParentId,
    setCreateFolderParentId,
    editFolderOpen,
    setEditFolderOpen,
    editFolderTarget,
    setEditFolderTarget,
    moveFolderOpen,
    setMoveFolderOpen,
    moveFolderTarget,
    setMoveFolderTarget,
    editAccessOpen,
    setEditAccessOpen,
    editAccessMode,
    setEditAccessMode,
    editAccessCurrent,
    setEditAccessCurrent,
    folderNotEmptyInfo,
    setFolderNotEmptyInfo,
    draggingAssetIds,
    setDraggingAssetIds,
    draggingFolderId,
    setDraggingFolderId,
    sensors,
    movingAssetIds,
    setMovingAssetIds,
    dropSuccessPulse,
    setDropSuccessPulse,
    searchInput,
    setSearchInput,
    searchQuery,
    setSearchQuery,
    currentFolderId,
    setCurrentFolderId,
    focusedFolderId,
    setFocusedFolderId,
    filters,
    setFilters,
    ordering,
    setOrdering,
    explicitFilterActive,
    foldersQuery,
    tagsQuery,
    assetsListQueryKey,
    assetsQuery,
    items,
    orderedAssetIds,
    masonryEntries,
    folderById,
    folderPath,
    moreOpen,
    setMoreOpen,
    moreHovered,
    setMoreHovered,
    typeTabValue,
    moreTabLabel,
    moreMenuItems,
    sentinelRef,
    bulkMoveMutation,
    bulkDeleteMutation,
    bulkUpdateMutation,
    createFolderMutation,
    updateFolderMutation,
    deleteFolderMutation,
    openEditAccessDialog,
    createParentLabel,
    openBulkDeleteDialog,
    tryDeleteFolder,
    onDragStart,
    onDragCancel,
    onDragEnd,
  };
}
export type AssetsViewController = ReturnType<typeof useAssetsViewController>;
