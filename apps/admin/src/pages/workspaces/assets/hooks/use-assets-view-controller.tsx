import { FileText, Music, Package } from "lucide-react";
import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
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
  deleteAsset,
  deleteAssetFolderWithMove,
  patchAsset,
  updateAssetFolder,
} from "@/api/assets";
import type { PageData, AdminAssetFolder, AdminAssetSummary } from "@/types/api";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { clearSelection, type AssetSelectionState } from "@/lib/assets/asset-selection";
import { invalidateAssetListQueries } from "@/lib/assets/invalidate-asset-list-queries";
import { useAssetsRecentStore } from "@/stores/use-assets-recent-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useAssetsExplorerController } from "../components/explorer/use-assets-explorer-controller";
import { assetScopeKey, type AssetScopeRef } from "@/lib/assets/asset-scope";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import type { AssetsViewMode } from "../components/assets-view-mode-toggle";
import {
  DND_ROOT_ID,
  parseAssetItemDndId,
  parseCreateFolderDndId,
  parseFolderDndId,
  parseFolderItemDndId,
} from "../components/assets-view-dnd";

import { useAssetsRecentItems } from "./use-assets-recent-items";

function getDraggedAssetIds(activeAssetId: string, selectedIds: Set<string>) {
  if (!selectedIds.has(activeAssetId)) return [activeAssetId];
  return Array.from(selectedIds);
}

function isSameFolderDrop(currentFolderId: string | null, destinationFolderId: string | null) {
  return String(currentFolderId || "") === String(destinationFolderId || "");
}

function triggerDropPulse(
  droppableId: string,
  setDropSuccessPulse: Dispatch<
    SetStateAction<{
      droppableId: string;
      nonce: number;
    } | null>
  >,
) {
  const nonce = Date.now();
  setDropSuccessPulse({ droppableId, nonce });
  window.setTimeout(() => {
    setDropSuccessPulse((prev) => (prev?.nonce === nonce ? null : prev));
  }, 300);
}

export function useAssetsViewController(_viewMode: AssetsViewMode = "card") {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const removeRecentAssets = useAssetsRecentStore((state) => state.removeAssets);
  const scope = useMemo<AssetScopeRef | null>(
    () => (workspaceId ? { type: "workspace", id: String(workspaceId) } : null),
    [workspaceId],
  );
  const scopeKey = scope ? assetScopeKey(scope) : null;
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
  const [createFolderSeedAssetIds, setCreateFolderSeedAssetIds] = useState<string[]>([]);
  const [editFolderOpen, setEditFolderOpen] = useState(false);
  const [editFolderTarget, setEditFolderTarget] = useState<AdminAssetFolder | null>(null);
  const [moveFolderOpen, setMoveFolderOpen] = useState(false);
  const [moveFolderTarget, setMoveFolderTarget] = useState<AdminAssetFolder | null>(null);
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<AdminAssetFolder | null>(null);
  const [editAccessOpen, setEditAccessOpen] = useState(false);
  const [editAccessMode, setEditAccessMode] = useState<"single" | "bulk">("bulk");
  const [editAccessCurrent, setEditAccessCurrent] = useState<{
    visibility?: string;
    purpose?: string;
    indexable?: boolean;
  }>({});
  const [editAssetOpen, setEditAssetOpen] = useState(false);
  const [editAssetTarget, setEditAssetTarget] = useState<AssetMasonryItem | null>(null);
  const [assetDeleteOpen, setAssetDeleteOpen] = useState(false);
  const [assetDeleteTarget, setAssetDeleteTarget] = useState<AssetMasonryItem | null>(null);
  const [assetEditAccessOpen, setAssetEditAccessOpen] = useState(false);
  const [assetEditAccessTarget, setAssetEditAccessTarget] = useState<AssetMasonryItem | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [draggingAssetIds, setDraggingAssetIds] = useState<string[]>([]);
  const [draggingAssetLeadId, setDraggingAssetLeadId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [dropSuccessPulse, setDropSuccessPulse] = useState<{
    droppableId: string;
    nonce: number;
  } | null>(null);
  const explorer = useAssetsExplorerController({
    scope,
    pagination: "infinite",
    initialPageSize: 10,
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
    effectiveVisibility,
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
    pagedAssetsQuery,
    page,
    pageSize,
    setPage,
    setPageSize,
    total,
  } = explorer;
  const { recentAssets, removeRecentAsset, clearRecentAssets } = useAssetsRecentItems({
    workspaceId,
    active,
    items,
  });
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
  const moreMenuItems = useMemo<Array<{ key: string; label: string; icon?: ReactNode }>>(
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
  const bulkMoveMutation = useMutation({
    mutationFn: (payload: Parameters<typeof bulkMoveAssets>[1]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return bulkMoveAssets(String(workspaceId), payload);
    },
    onSuccess: (out) => {
      notifySuccessText(t("assets:ASSET_BULK_MOVE_SUCCESS", { count: out.movedCount }));
      void invalidateAssetListQueries(queryClient, scopeKey);
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: (payload: Parameters<typeof bulkDeleteAssets>[1]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return bulkDeleteAssets(String(workspaceId), payload);
    },
    onSuccess: (out) => {
      notifySuccessText(t("assets:ASSET_BULK_DELETE_SUCCESS", { count: out.deletedCount }));
      if (workspaceId) {
        removeRecentAssets(String(workspaceId), out.deletedAssetIds.map(String));
      }
      void invalidateAssetListQueries(queryClient, scopeKey);
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
      const hasAccessFieldChange =
        Boolean(out.visibility || out.purpose) || typeof out.indexable !== "undefined";
      if (updatedIds.size > 0 && hasAccessFieldChange) {
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
                      indexable:
                        typeof out.indexable !== "undefined" ? out.indexable : row.indexable,
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
            indexable: typeof out.indexable !== "undefined" ? out.indexable : prev.indexable,
          };
        });
        if (willDisappearFromList) {
          setSelection((prev) => clearSelection(prev));
        }
      }
      void invalidateAssetListQueries(queryClient, scopeKey);
      if (scopeKey)
        void queryClient.invalidateQueries({ queryKey: ["assets", "detail", scopeKey] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const assetDeleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteAsset(String(workspaceId), assetId);
    },
    onSuccess: (_out, assetId) => {
      notifySuccessText(t("assets:ASSET_DELETE_SUCCESS"));
      if (workspaceId) {
        removeRecentAssets(String(workspaceId), [String(assetId)]);
      }
      if (scopeKey) {
        void queryClient.invalidateQueries({ queryKey: ["assets", "detail", scopeKey] });
      }
      void invalidateAssetListQueries(queryClient, scopeKey);
      setAssetDeleteOpen(false);
      setAssetDeleteTarget(null);
      setActive((prev) => (prev && prev.id === assetId ? null : prev));
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const singleAssetAccessMutation = useMutation({
    mutationFn: async (payload: {
      assetId: string;
      visibility?: string;
      purpose?: string;
      indexable?: boolean;
    }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      const { assetId, ...rest } = payload;
      return patchAsset(String(workspaceId), assetId, rest);
    },
    onSuccess: () => {
      notifySuccessText(t("assets:ASSET_EDIT_ACCESS_SUCCESS"));
      if (scopeKey) {
        void queryClient.invalidateQueries({ queryKey: ["assets", "detail", scopeKey] });
      }
      void invalidateAssetListQueries(queryClient, scopeKey);
      setAssetEditAccessOpen(false);
      setAssetEditAccessTarget(null);
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
      if (scopeKey)
        void queryClient.invalidateQueries({ queryKey: ["assets", "folders", scopeKey] });
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
      if (scopeKey)
        void queryClient.invalidateQueries({ queryKey: ["assets", "folders", scopeKey] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const reorderFoldersMutation = useMutation({
    mutationFn: async (folders: AdminAssetFolder[]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await Promise.all(
        folders.map((folder, index) =>
          updateAssetFolder(String(workspaceId), String(folder.id), { sortOrder: index }),
        ),
      );
      return folders.map((folder, index) => ({ ...folder, sortOrder: index }));
    },
    onSuccess: (nextFolders) => {
      if (scopeKey) {
        queryClient.setQueryData(["assets", "folders", scopeKey], (old: unknown) => {
          const data = old as PageData<AdminAssetFolder> | undefined;
          if (!data) return old;
          const nextById = new Map(nextFolders.map((folder) => [String(folder.id), folder]));
          const items = data.items.map((folder) => nextById.get(String(folder.id)) ?? folder);
          return Object.assign({}, data, { items });
        });
        void queryClient.invalidateQueries({ queryKey: ["assets", "folders", scopeKey] });
      }
    },
    onError: (err) => {
      notifyError(err);
    },
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (input: { folderId: string; destinationFolderId: string | null }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteAssetFolderWithMove(String(workspaceId), input.folderId, {
        destinationFolderId: input.destinationFolderId,
      });
    },
    onSuccess: () => {
      if (scopeKey)
        void queryClient.invalidateQueries({ queryKey: ["assets", "folders", scopeKey] });
      void invalidateAssetListQueries(queryClient, scopeKey);
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
  useEffect(() => {
    if (selectedIds.size <= 1) return;
    setActive((prev) => (prev ? null : prev));
  }, [selectedIds]);
  const openEditAccessDialog = () => {
    const ids = Array.from(selectedIds);
    if (ids.length <= 0) return;
    if (ids.length === 1) {
      const asset = items.find((x) => x.id === ids[0]);
      setEditAccessMode("single");
      setEditAccessCurrent({
        visibility: asset?.visibility,
        purpose: asset?.purpose,
        indexable: asset?.indexable,
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
  const createFolderSeedAssetCount = createFolderSeedAssetIds.length;
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
  const openEditAssetDialog = (asset: AssetMasonryItem) => {
    setEditAssetTarget(asset);
    setEditAssetOpen(true);
  };
  const openAssetDeleteDialog = (asset: AssetMasonryItem) => {
    setAssetDeleteTarget(asset);
    setAssetDeleteOpen(true);
  };
  const openAssetEditAccessDialog = (asset: AssetMasonryItem) => {
    setAssetEditAccessTarget(asset);
    setAssetEditAccessOpen(true);
  };
  const openDeleteFolderDialog = (folder: AdminAssetFolder) => {
    setDeleteFolderTarget(folder);
    setDeleteFolderOpen(true);
  };
  const onDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const folderMoveId = parseFolderItemDndId(activeId);
    if (folderMoveId) {
      setDraggingFolderId(folderMoveId);
      setDraggingAssetIds([]);
      setDraggingAssetLeadId(null);
      flushSync(() => {
        setFocusedFolderId(folderMoveId);
        setSelection((prev) => clearSelection(prev));
        setActive(null);
      });
      return;
    }
    const assetDragId = parseAssetItemDndId(activeId);
    if (assetDragId) {
      setDraggingFolderId(null);
      setDraggingAssetLeadId(assetDragId);
      setDraggingAssetIds(getDraggedAssetIds(assetDragId, selectedIds));
      setFocusedFolderId(null);
      return;
    }
    setDraggingFolderId(null);
    setDraggingAssetIds([]);
    setDraggingAssetLeadId(null);
  };
  const onDragCancel = () => {
    setDraggingFolderId(null);
    setDraggingAssetIds([]);
    setDraggingAssetLeadId(null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    void (async () => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : "";
      const folderMoveId = parseFolderItemDndId(activeId);
      const assetDragId = parseAssetItemDndId(activeId);
      const createFolderDropParentId = overId ? parseCreateFolderDndId(overId) : undefined;
      const folderId = overId ? parseFolderDndId(overId) : undefined;
      const canMove =
        overId === DND_ROOT_ID || (typeof folderId === "string" && folderId.length > 0);
      // Always clear drag visuals at the end of a drag gesture.
      setDraggingFolderId(null);
      setDraggingAssetLeadId(null);
      const draggedAssetIds =
        assetDragId && draggingAssetIds.length
          ? draggingAssetIds
          : assetDragId
            ? getDraggedAssetIds(assetDragId, selectedIds)
            : [];
      setDraggingAssetIds([]);
      const destFolderId = folderId ?? null;
      if (folderMoveId) {
        if (!canMove) return;
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
        await updateFolderMutation.mutateAsync({
          folderId: String(folderMoveId),
          payload: { parentId: destFolderId },
        });
        triggerDropPulse(overId, setDropSuccessPulse);
        return;
      }
      if (assetDragId) {
        if (draggedAssetIds.length === 0) return;
        if (createFolderDropParentId !== undefined) {
          setCreateFolderParentId(createFolderDropParentId);
          setCreateFolderSeedAssetIds(draggedAssetIds);
          setCreateFolderOpen(true);
          return;
        }
        if (!canMove) return;
        if (isSameFolderDrop(currentFolderId, destFolderId)) return;
        await bulkMoveMutation.mutateAsync({ assetIds: draggedAssetIds, folderId: destFolderId });
        triggerDropPulse(overId, setDropSuccessPulse);
        const shouldClearSelection = draggedAssetIds.some((assetId) => selectedIds.has(assetId));
        flushSync(() => {
          if (shouldClearSelection) {
            setSelection((prev) => clearSelection(prev));
          }
          setActive((prev) => (prev && draggedAssetIds.includes(String(prev.id)) ? null : prev));
        });
      }
    })();
  };
  return {
    t,
    queryClient,
    workspaceId,
    scope,
    scopeKey,
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
    createFolderSeedAssetIds,
    setCreateFolderSeedAssetIds,
    createFolderSeedAssetCount,
    editFolderOpen,
    setEditFolderOpen,
    editFolderTarget,
    setEditFolderTarget,
    moveFolderOpen,
    setMoveFolderOpen,
    moveFolderTarget,
    setMoveFolderTarget,
    deleteFolderOpen,
    setDeleteFolderOpen,
    deleteFolderTarget,
    setDeleteFolderTarget,
    editAccessOpen,
    setEditAccessOpen,
    editAccessMode,
    setEditAccessMode,
    editAccessCurrent,
    setEditAccessCurrent,
    draggingFolderId,
    draggingAssetIds,
    draggingAssetLeadId,
    setDraggingFolderId,
    sensors,
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
    effectiveVisibility,
    ordering,
    setOrdering,
    explicitFilterActive,
    foldersQuery,
    tagsQuery,
    assetsListQueryKey,
    assetsQuery,
    pagedAssetsQuery,
    items,
    recentAssets,
    removeRecentAsset,
    clearRecentAssets,
    orderedAssetIds,
    masonryEntries,
    folderById,
    folderPath,
    page,
    pageSize,
    setPage,
    setPageSize,
    total,
    moreOpen,
    setMoreOpen,
    moreHovered,
    setMoreHovered,
    typeTabValue,
    moreTabLabel,
    moreMenuItems,
    editAssetOpen,
    setEditAssetOpen,
    editAssetTarget,
    assetDeleteOpen,
    setAssetDeleteOpen,
    assetDeleteTarget,
    assetDeleteMutation,
    assetEditAccessOpen,
    setAssetEditAccessOpen,
    assetEditAccessTarget,
    singleAssetAccessMutation,
    bulkMoveMutation,
    bulkDeleteMutation,
    bulkUpdateMutation,
    createFolderMutation,
    updateFolderMutation,
    reorderFoldersMutation,
    deleteFolderMutation,
    openEditAssetDialog,
    openAssetDeleteDialog,
    openAssetEditAccessDialog,
    openEditAccessDialog,
    createParentLabel,
    openBulkDeleteDialog,
    openDeleteFolderDialog,
    onDragStart,
    onDragCancel,
    onDragEnd,
  };
}
export type AssetsViewController = ReturnType<typeof useAssetsViewController>;
