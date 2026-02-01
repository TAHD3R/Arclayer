import { Button, Dropdown, Input, Masonry } from "antd";
import {
  Eye,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Music,
  Package,
  PencilLine,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  keepPreviousData,
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import { useAnimationControls } from "motion/react";

import { DefaultPage } from "@/components/app/defaultPage";
import { LoaderOne } from "@/components/ui/loader";
import ChevronDownIcon from "@/components/ui/icons/chevron-down";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@/components/ui/chrome-tabs";
import { cn } from "@/lib/utils";
import {
  bulkDeleteAssets,
  bulkMoveAssets,
  bulkUpdateAssets,
  createAssetFolder,
  deleteAssetFolder,
  listAssetFolders,
  listAssetTags,
  listAssets,
  updateAssetFolder,
  type PageData,
  type AdminAssetFolder,
  type AdminAssetTag,
  type AdminAssetSummary,
} from "@/api/assets";
import { getAppConfig } from "@/constants/app-config";
import { getErrorMessage, notifyError, notifySuccessText } from "@/utils/notifications";
import { PageState } from "@/components/app/pageState";
import {
  AssetMasonryTile,
  AssetPreviewSheet,
  type AssetMasonryItem,
} from "@/views/assets/components/AssetMasonryCard";
import { BulkDeleteAssetsDialog } from "@/views/assets/components/BulkDeleteAssetsDialog";
import { CreateAssetFolderDialog } from "@/views/assets/components/CreateAssetFolderDialog";
import { FolderNotEmptyDialog } from "@/views/assets/components/FolderNotEmptyDialog";
import { MoveAssetsToFolderModal } from "@/views/assets/components/MoveAssetsToFolderModal";
import { MoveFolderModal } from "@/views/assets/components/MoveFolderModal";
import { UpdateAssetsAccessDialog } from "@/views/assets/components/UpdateAssetsAccessDialog";
import { UpdateAssetFolderDialog } from "@/views/assets/components/UpdateAssetFolderDialog";
import { resolvePublicAssetUrlPath } from "@/views/assets/utils/assetUrls";
import {
  AssetsFilterPopover,
  type AssetsFilters,
} from "@/views/assets/components/AssetsFilterPopover";
import { AssetUploadDialog } from "@/views/assets/components/AssetUploadDialog";
import {
  clearSelection,
  rangeSelect,
  selectOnly,
  toggleSelect,
  type AssetSelectionState,
} from "@/views/assets/utils/assetSelection";
import type { MenuProps } from "antd";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

type MasonryEntry =
  | { kind: "asset"; asset: AssetMasonryItem }
  | { kind: "folder"; folder: AdminAssetFolder }
  | { kind: "folderUp" };

const DND_ASSET_PREFIX = "asset:";
const DND_FOLDER_PREFIX = "folder:";
const DND_FOLDER_ITEM_PREFIX = "folderItem:";
const DND_ROOT_ID = `${DND_FOLDER_PREFIX}__root__`;

function toAssetDndId(assetId: string) {
  return `${DND_ASSET_PREFIX}${assetId}`;
}

function toFolderDndId(folderId: string) {
  return `${DND_FOLDER_PREFIX}${folderId}`;
}

function toFolderItemDndId(folderId: string) {
  return `${DND_FOLDER_ITEM_PREFIX}${folderId}`;
}

function parseAssetDndId(id: string): string | null {
  if (!id.startsWith(DND_ASSET_PREFIX)) return null;
  return id.slice(DND_ASSET_PREFIX.length);
}

function parseFolderDndId(id: string): string | null {
  if (!id.startsWith(DND_FOLDER_PREFIX)) return null;
  const raw = id.slice(DND_FOLDER_PREFIX.length);
  if (!raw) return null;
  return raw === "__root__" ? null : raw;
}

function parseFolderItemDndId(id: string): string | null {
  if (!id.startsWith(DND_FOLDER_ITEM_PREFIX)) return null;
  const raw = id.slice(DND_FOLDER_ITEM_PREFIX.length);
  if (!raw) return null;
  return raw;
}

const snapOverlayCenterToPointer = (args: any) => {
  const { transform, activeNodeRect, overlayNodeRect, activatorEvent } = args;
  const base = {
    x: Number(transform?.x || 0),
    y: Number(transform?.y || 0),
    scaleX: Number.isFinite(transform?.scaleX) ? Number(transform.scaleX) : 1,
    scaleY: Number.isFinite(transform?.scaleY) ? Number(transform.scaleY) : 1,
  };

  if (!activeNodeRect || !overlayNodeRect || !activatorEvent) return base;

  // We only need the initial pointer position to compute a constant offset, so the overlay
  // stays centered under the cursor during the whole drag.
  let clientX: number | null = null;
  let clientY: number | null = null;

  const evt = activatorEvent as unknown;
  if (typeof evt === "object" && evt && "clientX" in (evt as Record<string, unknown>)) {
    clientX = Number((evt as { clientX: number }).clientX);
    clientY = Number((evt as { clientY: number }).clientY);
  } else if (typeof evt === "object" && evt && "touches" in (evt as Record<string, unknown>)) {
    const touches = (evt as { touches: Array<{ clientX: number; clientY: number }> }).touches;
    const t0 = touches?.[0];
    if (t0) {
      clientX = Number(t0.clientX);
      clientY = Number(t0.clientY);
    }
  }

  if (clientX === null || clientY === null) return base;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return base;

  const grabOffsetX = clientX - activeNodeRect.left;
  const grabOffsetY = clientY - activeNodeRect.top;

  return {
    ...base,
    x: base.x + grabOffsetX - overlayNodeRect.width / 2,
    y: base.y + grabOffsetY - overlayNodeRect.height / 2,
  };
};

type DraggableBindings = {
  setNodeRef: (node: HTMLElement | null) => void;
  listeners: Record<string, unknown>;
  attributes: Record<string, unknown>;
};

function AssetDraggableProvider(props: {
  assetId: string;
  children: (bindings: DraggableBindings) => ReactNode;
}) {
  const dnd = useDraggable({
    id: toAssetDndId(props.assetId),
    data: { kind: "asset", assetId: props.assetId },
  });
  return props.children({
    setNodeRef: dnd.setNodeRef,
    listeners: dnd.listeners as unknown as Record<string, unknown>,
    attributes: dnd.attributes as unknown as Record<string, unknown>,
  });
}

function FolderDraggableProvider(props: {
  folderId: string;
  children: (bindings: DraggableBindings) => ReactNode;
}) {
  const dnd = useDraggable({
    id: toFolderItemDndId(props.folderId),
    data: { kind: "folder", folderId: props.folderId },
  });
  return props.children({
    setNodeRef: dnd.setNodeRef,
    listeners: dnd.listeners as unknown as Record<string, unknown>,
    attributes: dnd.attributes as unknown as Record<string, unknown>,
  });
}

type DroppableBindings = {
  setNodeRef: (node: HTMLElement | null) => void;
  isOver: boolean;
};

function DroppablePulse(props: {
  droppableId: string;
  setNodeRef: (node: HTMLElement | null) => void;
  isOver: boolean;
  pulseNonce: number | null;
  className?: string;
  children: ReactNode;
}) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (props.isOver) {
      void controls.start({ scale: 1.02, transition: { duration: 0.12, ease: "easeOut" } });
      return;
    }
    // When not hovering, ensure we settle back.
    void controls.start({ scale: 1, transition: { duration: 0.12, ease: "easeOut" } });
  }, [controls, props.isOver]);

  useEffect(() => {
    if (props.isOver) return;
    if (!props.pulseNonce) return;
    // Trigger a brief "success" bounce when a drop finishes on this target.
    void controls.start({
      scale: [1, 1.06, 1],
      transition: { duration: 0.18, ease: "easeOut" },
    });
  }, [controls, props.isOver, props.pulseNonce]);

  return (
    <motion.div
      ref={props.setNodeRef}
      className={props.className || "inline-flex"}
      animate={controls}
      style={{ willChange: "transform" }}
    >
      {props.children}
    </motion.div>
  );
}

function FolderDroppableProvider(props: {
  droppableId: string;
  children: (bindings: DroppableBindings) => ReactNode;
}) {
  const dnd = useDroppable({
    id: props.droppableId,
    data: { kind: "folder", folderId: parseFolderDndId(props.droppableId) },
  });
  return props.children({ setNodeRef: dnd.setNodeRef, isOver: dnd.isOver });
}

function DragSelectionOverlay(props: { count: number }) {
  const stackCount = Math.min(3, Math.max(1, props.count));
  const offset = (stackCount - 1) * 8;
  const width = 156 + offset;
  const height = 104 + offset;
  return (
    <motion.div
      className="relative inline-block pointer-events-none select-none"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ willChange: "transform", width, height }}
    >
      <div className="relative h-full w-full">
        {Array.from({ length: stackCount }).map((_, idx) => (
          <div
            key={idx}
            className="absolute left-0 top-0 overflow-hidden rounded-lg border border-border bg-card"
            style={{
              transform: `translate(${idx * 8}px, ${idx * 8}px)`,
              width: 156,
              height: 104,
            }}
          >
            <div className="relative h-full w-full bg-muted/20">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/10 via-muted/35 to-muted/10" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(var(--foreground)/0.08),transparent_55%),radial-gradient(circle_at_80%_70%,hsl(var(--foreground)/0.06),transparent_60%)] opacity-70" />
              <div className="absolute inset-0 flex items-end p-3">
                <div className="w-full space-y-2 opacity-70">
                  <div className="h-2 w-2/3 bg-foreground/10" />
                  <div className="h-2 w-1/2 bg-foreground/5" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {props.count > 1 ? (
        <div className="absolute right-2 top-2 border border-border bg-card px-2 py-1 text-xs font-semibold">
          {props.count}
        </div>
      ) : null}
    </motion.div>
  );
}

function DragFolderOverlay(props: { folderName: string; folderLabel: string }) {
  return (
    <motion.div
      className="relative inline-block pointer-events-none select-none"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ willChange: "transform", width: 156, height: 104 }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-card">
        <div className="absolute inset-0 bg-muted/10" />
        <div className="relative flex h-full flex-col justify-between p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Folder size={18} className="opacity-80" />
            <span className="text-sm tracking-wide">{props.folderLabel}</span>
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate" title={props.folderName}>
              {props.folderName}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function formatBytes(bytes: number | undefined | null): string | undefined {
  if (!bytes || bytes < 0) return undefined;
  const units = ["B", "KB", "MB", "GB"] as const;
  let v = bytes;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  const n = idx === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0);
  return `${n} ${units[idx]}`;
}

function toMasonryItem(
  asset: AdminAssetSummary,
  opts?: { aspectRatioOverride?: number },
): AssetMasonryItem {
  const name =
    asset.originalFilename?.trim() ||
    asset.title?.trim() ||
    (asset.slug && asset.ext ? `${asset.slug}.${asset.ext}` : asset.id);

  // Prefer thumbnails for waterfall view to save bandwidth.
  // 注意：public `/assets/*` 在 dev 下不应再通过 Vite 代理；这里直接拼出后端绝对 URL。
  // 重要：不要使用后端拼出来的“真实文件名链接”，统一走 canonical 路由：
  // - /assets/<id>（后端会 301 到 /assets/<id>/<slug>.<ext>）
  // - /assets/<id>/thumb?w=xxx
  const canonicalPublicPath = `/assets/${asset.id}`;
  const canonicalThumbBasePath = `/assets/${asset.id}/thumb`;
  const canonicalDownloadPath = `/assets/${asset.id}/download`;

  const isImage = Boolean(asset.mime?.startsWith("image/"));
  const thumbBaseUrl = isImage ? resolvePublicAssetUrlPath(canonicalThumbBasePath) : undefined;
  const publicUrl =
    asset.visibility === "public" ? resolvePublicAssetUrlPath(canonicalPublicPath) : undefined;
  const previewUrl = isImage ? (thumbBaseUrl ? `${thumbBaseUrl}?w=400` : publicUrl) : undefined;
  const downloadUrl =
    asset.visibility === "public" ? resolvePublicAssetUrlPath(canonicalDownloadPath) : undefined;

  // Admin content endpoint 走 apiPrefix（可能依赖 Vite proxy 绕过 CORS），所以这里只拼 apiBaseUrl。
  const { apiBaseUrl } = getAppConfig();
  const joinApiBaseUrl = (path: string) => {
    const b = (apiBaseUrl || "").trim();
    if (!b) return path;
    const base = b.endsWith("/") ? b.slice(0, -1) : b;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  };
  const contentUrl = asset.contentUrlPath ? joinApiBaseUrl(asset.contentUrlPath) : undefined;

  return {
    id: asset.id,
    name,
    description: undefined,
    mimeType: asset.mime || undefined,
    ext: asset.ext || undefined,
    sizeText: formatBytes(asset.sizeBytes),
    createdAtText: asset.createdAt?.slice(0, 10),
    previewUrl,
    thumbBaseUrl,
    createdAt: asset.createdAt,
    sizeBytes: asset.sizeBytes,
    checksumSha256: asset.checksumSha256 || undefined,
    visibility: asset.visibility,
    purpose: asset.purpose,
    indexable: asset.indexable,
    publicUrl,
    downloadUrl,
    contentUrl,
    uploaderName: asset.uploaderName || undefined,
    aspectRatio: opts?.aspectRatioOverride,
  };
}

export function AssetsView() {
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

  // Search / filters / ordering
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [focusedFolderId, setFocusedFolderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AssetsFilters>(() => ({
    // 默认只看 public：瀑布流需要 thumb/public url 才能稳定预览；
    // 其他可见性可通过筛选器切换，但可能只显示“无预览”占位。
    visibility: "public",
  }));
  const [ordering, setOrdering] = useState<string>("-created_at");
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

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const foldersQuery = useQuery({
    queryKey: ["assets", "folders", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listAssetFolders(String(workspaceId), { size: 200 }),
    staleTime: 60 * 1000,
  });

  const tagsQuery = useQuery({
    queryKey: ["assets", "tags", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listAssetTags(String(workspaceId)),
    staleTime: 60 * 1000,
  });

  const assetsListQueryKey = useMemo(
    () => [
      "assets",
      "list",
      workspaceId,
      {
        purpose: "library",
        q: searchQuery || undefined,
        mimePrefix: filters.mimePrefix,
        folderId: currentFolderId || undefined,
        folderIsNull: currentFolderId ? undefined : true,
        visibility: filters.visibility,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
        tagIds: filters.tagIds,
        ordering,
      },
    ],
    [
      currentFolderId,
      filters.createdFrom,
      filters.createdTo,
      filters.mimePrefix,
      filters.tagIds,
      filters.visibility,
      ordering,
      searchQuery,
      workspaceId,
    ],
  );

  const assetsQuery = useInfiniteQuery({
    queryKey: assetsListQueryKey,
    queryFn: async ({ pageParam }) =>
      workspaceId
        ? listAssets(String(workspaceId), {
            page: typeof pageParam === "number" ? pageParam : 1,
            size: 24,
            purpose: "library",
            q: searchQuery || undefined,
            mimePrefix: filters.mimePrefix,
            folderId: currentFolderId || undefined,
            folderIsNull: currentFolderId ? undefined : true,
            visibility: filters.visibility,
            createdFrom: filters.createdFrom,
            createdTo: filters.createdTo,
            tagIds: filters.tagIds,
            ordering,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    enabled: Boolean(workspaceId),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

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
  // PageState will render a full error UI with details + retry.

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

  const items = useMemo<AssetMasonryItem[]>(() => {
    if (!assetsQuery.data) return [];
    const rows = assetsQuery.data.pages.flatMap((p) => p.items);
    const mapped = rows.map((row) =>
      toMasonryItem(row, { aspectRatioOverride: aspectRatioRef.current.get(row.id) }),
    );
    return mapped.length ? mapped : [];
  }, [assetsQuery.data, layoutTick]);

  const orderedAssetIds = useMemo(() => items.map((it) => it.id), [items]);

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

  const folderEntries = useMemo<MasonryEntry[]>(() => {
    const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
    const isRoot = !currentFolderId;

    const visible = folders.filter((f) =>
      isRoot ? !f.parentId : String(f.parentId || "") === String(currentFolderId),
    );

    // Root shows only top-level folders; folder mode shows its immediate children.
    const out: MasonryEntry[] = [];
    if (!isRoot) out.push({ kind: "folderUp" });
    for (const f of visible) out.push({ kind: "folder", folder: f });
    return out;
  }, [currentFolderId, foldersQuery.data]);

  const masonryEntries = useMemo<MasonryEntry[]>(() => {
    return [...folderEntries, ...items.map((asset): MasonryEntry => ({ kind: "asset", asset }))];
  }, [folderEntries, items]);

  const folderPath = useMemo(() => {
    const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
    const byId = new Map<string, AdminAssetFolder>();
    for (const f of folders) byId.set(String(f.id), f);

    if (!currentFolderId) return [] as AdminAssetFolder[];
    const out: AdminAssetFolder[] = [];
    let cur = byId.get(String(currentFolderId));
    // Cap to 10 levels to avoid infinite loops if parentId data is malformed.
    for (let i = 0; i < 10 && cur; i += 1) {
      out.unshift(cur);
      const pid = cur.parentId ? String(cur.parentId) : "";
      cur = pid ? byId.get(pid) : undefined;
    }
    return out;
  }, [currentFolderId, foldersQuery.data]);

  const folderById = useMemo(() => {
    const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
    const mp = new Map<string, AdminAssetFolder>();
    for (const f of folders) mp.set(String(f.id), f);
    return mp;
  }, [foldersQuery.data]);

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

  return (
    <DefaultPage
      title={t("nav:NAV_ASSETS")}
      width="full"
      action={
        <Button type="primary" icon={<Plus size={16} />} onClick={() => setUploadOpen(true)}>
          {t("assets:ASSET_ACTION_UPLOAD")}
        </Button>
      }
      extra={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <ChromeTabs
              value={typeTabValue}
              onValueChange={(next) => {
                if (next === "all") {
                  setFilters((prev) => ({ ...prev, mimePrefix: undefined }));
                  setMoreOpen(false);
                  return;
                }
                if (next === "image") {
                  setFilters((prev) => ({ ...prev, mimePrefix: "image/" }));
                  setMoreOpen(false);
                  return;
                }
                if (next === "video") {
                  setFilters((prev) => ({ ...prev, mimePrefix: "video/" }));
                  setMoreOpen(false);
                  return;
                }
                // "more" is controlled via dropdown menu; clicking it should not change filters.
              }}
            >
              <ChromeTabsList className="w-auto">
                <ChromeTabsTrigger value="all">{t("assets:ASSET_TYPE_TAB_ALL")}</ChromeTabsTrigger>
                <ChromeTabsTrigger value="image">
                  {t("assets:ASSET_FILTER_TYPE_IMAGE")}
                </ChromeTabsTrigger>
                <ChromeTabsTrigger value="video">
                  {t("assets:ASSET_FILTER_TYPE_VIDEO")}
                </ChromeTabsTrigger>

                <Dropdown
                  trigger={["click"]}
                  open={moreOpen}
                  onOpenChange={(open) => setMoreOpen(open)}
                  menu={{
                    items: moreMenuItems,
                    onClick: (info) => {
                      if (info.key === "audio") {
                        setFilters((prev) => ({ ...prev, mimePrefix: "audio/" }));
                        setMoreOpen(false);
                        return;
                      }
                      if (info.key === "text") {
                        setFilters((prev) => ({ ...prev, mimePrefix: "text/" }));
                        setMoreOpen(false);
                        return;
                      }
                      if (info.key === "application") {
                        setFilters((prev) => ({ ...prev, mimePrefix: "application/" }));
                        setMoreOpen(false);
                      }
                    },
                  }}
                >
                  <ChromeTabsTrigger
                    value="more"
                    className="flex items-center gap-1"
                    onMouseEnter={() => setMoreHovered(true)}
                    onMouseLeave={() => setMoreHovered(false)}
                  >
                    <span>{moreTabLabel}</span>
                    <ChevronDownIcon
                      size={16}
                      className="opacity-75"
                      isHovered={moreHovered || moreOpen}
                    />
                  </ChromeTabsTrigger>
                </Dropdown>
              </ChromeTabsList>
            </ChromeTabs>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              allowClear
              variant="borderless"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("assets:ASSET_SEARCH_PLACEHOLDER")}
              prefix={<Search size={16} className="text-muted-foreground" />}
              style={{ width: 260 }}
            />
            <AssetsFilterPopover
              value={filters}
              onChange={setFilters}
              ordering={ordering}
              onOrderingChange={setOrdering}
              defaultOrdering="-created_at"
              tags={(tagsQuery.data?.items ?? []) as AdminAssetTag[]}
              tagsLoading={tagsQuery.isLoading}
            />
          </div>
        </div>
      }
    >
      <AssetPreviewSheet active={active} onClose={() => setActive(null)} />
      <MoveAssetsToFolderModal
        open={moveModalOpen}
        onOpenChange={setMoveModalOpen}
        folders={(foldersQuery.data?.items ?? []) as AdminAssetFolder[]}
        foldersLoading={foldersQuery.isLoading}
        assetCount={selectedIds.size}
        confirmLoading={bulkMoveMutation.isPending}
        onMove={async (folderId) => {
          const assetIds = Array.from(selectedIds);
          if (!assetIds.length) return;
          await bulkMoveMutation.mutateAsync({ assetIds, folderId });
          setSelection((prev) => clearSelection(prev));
        }}
      />
      <UpdateAssetFolderDialog
        open={editFolderOpen}
        onOpenChange={setEditFolderOpen}
        folder={editFolderTarget}
        confirmLoading={updateFolderMutation.isPending}
        onConfirm={async (value) => {
          const folder = editFolderTarget;
          if (!folder) return;
          await updateFolderMutation.mutateAsync({
            folderId: String(folder.id),
            payload: { name: value.name, description: value.description },
          });
        }}
      />
      <MoveFolderModal
        open={moveFolderOpen}
        onOpenChange={setMoveFolderOpen}
        folder={moveFolderTarget}
        folders={(foldersQuery.data?.items ?? []) as AdminAssetFolder[]}
        foldersLoading={foldersQuery.isLoading}
        confirmLoading={updateFolderMutation.isPending}
        onMove={async (parentId) => {
          const folder = moveFolderTarget;
          if (!folder) return;
          await updateFolderMutation.mutateAsync({
            folderId: String(folder.id),
            payload: { parentId },
          });
        }}
      />
      <UpdateAssetsAccessDialog
        open={editAccessOpen}
        onOpenChange={setEditAccessOpen}
        mode={editAccessMode}
        assetCount={selectedIds.size}
        currentVisibility={editAccessCurrent.visibility}
        currentPurpose={editAccessCurrent.purpose}
        confirmLoading={bulkUpdateMutation.isPending}
        onConfirm={async (value) => {
          const assetIds = Array.from(selectedIds);
          if (!assetIds.length) return;
          if (!value.visibility && !value.purpose) return;
          await bulkUpdateMutation.mutateAsync({ assetIds, ...value });
        }}
      />
      <CreateAssetFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        parentLabel={createParentLabel}
        confirmLoading={createFolderMutation.isPending}
        onCreate={async (name, description) => {
          const parentId = createFolderParentId ?? currentFolderId;
          await createFolderMutation.mutateAsync({ name, parentId, description });
        }}
      />
      {folderNotEmptyInfo ? (
        <FolderNotEmptyDialog
          open={Boolean(folderNotEmptyInfo)}
          onOpenChange={(open) => {
            if (!open) setFolderNotEmptyInfo(null);
          }}
          folderName={folderNotEmptyInfo.folderName}
          hasAssets={folderNotEmptyInfo.hasAssets}
          hasChildren={folderNotEmptyInfo.hasChildren}
        />
      ) : null}
      <BulkDeleteAssetsDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        assetCount={selectedIds.size}
        confirmLoading={bulkDeleteMutation.isPending}
        onConfirm={async () => {
          const assetIds = Array.from(selectedIds);
          if (!assetIds.length) return;
          await bulkDeleteMutation.mutateAsync({ assetIds });
          setSelection((prev) => clearSelection(prev));
          setActive(null);
          setBulkDeleteOpen(false);
        }}
      />
      <AssetUploadDialog
        workspaceId={workspaceId ? String(workspaceId) : ""}
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
        }}
        defaultFolderId={currentFolderId || undefined}
        onUploaded={() => {
          // 上传成功后刷新列表；避免 refetch 当前页导致旧的 infinite pages 不一致，直接 invalidate 最稳。
          if (workspaceId)
            void queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
          setUploadOpen(false);
        }}
      />

      <PageState
        loading={assetsQuery.isLoading && !assetsQuery.data}
        loadingVariant="masonry"
        error={assetsQuery.isError ? assetsQuery.error : null}
        onRetry={() => void assetsQuery.refetch()}
        errorDescription={
          assetsQuery.isError ? (
            <div className="space-y-1">
              <div>{t("assets:ASSET_LIST_LOAD_FAILED_DESC")}</div>
              <div className="text-muted-foreground">{getErrorMessage(assetsQuery.error)}</div>
            </div>
          ) : undefined
        }
        empty={masonryEntries.length === 0}
        emptyDescription={t("assets:ASSET_EMPTY")}
      >
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FolderDroppableProvider droppableId={DND_ROOT_ID}>
                {({ setNodeRef, isOver }) => (
                  <DroppablePulse
                    droppableId={DND_ROOT_ID}
                    setNodeRef={setNodeRef}
                    isOver={isOver}
                    pulseNonce={
                      dropSuccessPulse?.droppableId === DND_ROOT_ID ? dropSuccessPulse.nonce : null
                    }
                  >
                    <div className={cn("inline-flex", isOver ? "ring-1 ring-foreground/60" : null)}>
                      <Button
                        type="text"
                        onClick={() => {
                          setCurrentFolderId(null);
                          setFocusedFolderId(null);
                          setSelection((prev) => clearSelection(prev));
                        }}
                      >
                        {t("assets:ASSET_BREADCRUMB_ROOT")}
                      </Button>
                    </div>
                  </DroppablePulse>
                )}
              </FolderDroppableProvider>

              {folderPath.map((f) => (
                <div key={String(f.id)} className="flex items-center gap-2">
                  <span className="text-muted-foreground">/</span>
                  <FolderDroppableProvider droppableId={toFolderDndId(String(f.id))}>
                    {({ setNodeRef, isOver }) => {
                      const id = toFolderDndId(String(f.id));
                      return (
                        <DroppablePulse
                          droppableId={id}
                          setNodeRef={setNodeRef}
                          isOver={isOver}
                          pulseNonce={
                            dropSuccessPulse?.droppableId === id ? dropSuccessPulse.nonce : null
                          }
                        >
                          <div
                            className={cn(
                              "inline-flex",
                              isOver ? "ring-1 ring-foreground/60" : null,
                            )}
                          >
                            <Button
                              type="text"
                              size="small"
                              onClick={() => {
                                setCurrentFolderId(String(f.id));
                                setFocusedFolderId(null);
                                setSelection((prev) => clearSelection(prev));
                              }}
                            >
                              {f.name}
                            </Button>
                          </div>
                        </DroppablePulse>
                      );
                    }}
                  </FolderDroppableProvider>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {assetsQuery.isFetching && !assetsQuery.isFetchingNextPage ? (
                <div className="scale-75 opacity-75">
                  <LoaderOne />
                </div>
              ) : null}

              <Button
                type="text"
                icon={<FolderPlus size={16} />}
                onClick={() => {
                  setCreateFolderParentId(currentFolderId);
                  setCreateFolderOpen(true);
                }}
              >
                {t("assets:ASSET_ACTION_CREATE_FOLDER")}
              </Button>
            </div>
          </div>

          <div
            className="select-none"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement | null;
              if (!target) return;
              // Click blank area => clear selection & folder focus (file-manager-like UX).
              if (target.closest("[data-asset-tile='true']")) return;
              if (target.closest("[data-folder-tile='true']")) return;
              setSelection((prev) => clearSelection(prev));
              setFocusedFolderId(null);
            }}
          >
            <Masonry
              gutter={[16, 16]}
              columns={{ xs: 1, sm: 2, md: 3, xl: 4, xxl: 5 }}
              fresh
              items={masonryEntries.map((it) => ({
                key:
                  it.kind === "asset"
                    ? it.asset.id
                    : it.kind === "folder"
                      ? `folder:${it.folder.id}`
                      : "folder:__up__",
                data: it,
              }))}
              itemRender={(info) => {
                const entry = info.data as MasonryEntry;
                return entry.kind === "asset" ? (
                  <AssetDraggableProvider assetId={entry.asset.id}>
                    {(dnd) => (
                      <Dropdown
                        trigger={["contextMenu"]}
                        menu={{
                          items: [
                            ...(selectedIds.size <= 1
                              ? [
                                  {
                                    key: "open",
                                    label: t("assets:ASSET_ACTION_OPEN"),
                                    icon: <Eye size={16} />,
                                  },
                                ]
                              : []),
                            {
                              key: "move",
                              label: t("assets:ASSET_ACTION_MOVE"),
                              icon: <FolderInput size={16} />,
                            },
                            {
                              key: "edit_access",
                              label: t("assets:ASSET_ACTION_EDIT_ACCESS"),
                              icon: <Settings2 size={16} />,
                            },
                            { type: "divider" },
                            {
                              key: "delete",
                              label: t("assets:ASSET_ACTION_DELETE_SELECTED"),
                              icon: <Trash2 size={16} />,
                              danger: true,
                            },
                          ],
                          onClick: ({ key, domEvent }) => {
                            domEvent.preventDefault();
                            domEvent.stopPropagation();
                            if (key === "open") {
                              setActive(entry.asset);
                              return;
                            }
                            if (key === "move") {
                              setMoveModalOpen(true);
                              return;
                            }
                            if (key === "edit_access") {
                              openEditAccessDialog();
                              return;
                            }
                            if (key === "delete") {
                              openBulkDeleteDialog();
                            }
                          },
                        }}
                      >
                        <div
                          onContextMenuCapture={() => {
                            const id = entry.asset.id;
                            setFocusedFolderId(null);
                            if (selectedIds.has(id)) return;
                            // Right-click on an unselected asset: sync-select it first so menu actions apply to the right selection.
                            flushSync(() => {
                              setSelection((prev) => selectOnly(prev, id));
                            });
                          }}
                          onContextMenu={(e) => {
                            // Prevent native browser context menu.
                            e.preventDefault();
                          }}
                        >
                          <AssetMasonryTile
                            asset={entry.asset}
                            selected={selectedIds.has(entry.asset.id)}
                            moving={movingAssetIds.has(entry.asset.id)}
                            dragRef={
                              dnd.setNodeRef as unknown as (node: HTMLDivElement | null) => void
                            }
                            dragAttributes={dnd.attributes}
                            dragListeners={dnd.listeners}
                            onSelect={(e) => {
                              setFocusedFolderId(null);
                              const id = entry.asset.id;
                              if (e.shiftKey) {
                                setSelection((prev) => rangeSelect(prev, id, orderedAssetIds));
                                return;
                              }
                              if (e.metaKey || e.ctrlKey) {
                                setSelection((prev) => toggleSelect(prev, id));
                                return;
                              }
                              setSelection((prev) => selectOnly(prev, id));
                            }}
                            onToggleSelected={(id) => {
                              setFocusedFolderId(null);
                              setSelection((prev) => toggleSelect(prev, id));
                            }}
                            onAspectRatio={(id, ar) => {
                              const safe = Number.isFinite(ar) && ar > 0.05 ? ar : 4 / 3;
                              const prev = aspectRatioRef.current.get(id);
                              if (prev && Math.abs(prev - safe) < 0.02) return;
                              aspectRatioRef.current.set(id, safe);
                              // Trigger a re-render so `toMasonryItem` can read the latest aspectRatio.
                              forceLayoutTick((v) => v + 1);
                            }}
                            onOpen={setActive}
                          />
                        </div>
                      </Dropdown>
                    )}
                  </AssetDraggableProvider>
                ) : entry.kind === "folderUp" ? (
                  <div
                    role="button"
                    tabIndex={0}
                    data-folder-tile="true"
                    className={cn(
                      "group relative w-full overflow-hidden border border-border/50 bg-card",
                      "rounded-lg shadow-sm transition duration-200 hover:shadow-md",
                      "cursor-pointer outline-none select-none",
                    )}
                    onClick={() => {
                      setFocusedFolderId("__up__");
                      setSelection((prev) => clearSelection(prev));
                      setActive(null);
                    }}
                    onDoubleClick={() => {
                      const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
                      const cur = folders.find((f) => f.id === currentFolderId);
                      setCurrentFolderId(cur?.parentId ? String(cur.parentId) : null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
                      const cur = folders.find((f) => f.id === currentFolderId);
                      setCurrentFolderId(cur?.parentId ? String(cur.parentId) : null);
                    }}
                  >
                    <div className="relative w-full overflow-hidden" style={{ aspectRatio: 4 / 3 }}>
                      <div className="absolute inset-0 grid place-items-center bg-linear-to-b from-primary/25 via-transparent to-transparent">
                        <div className="font-bold text-muted-foreground">
                          {t("assets:ASSET_FOLDER_UP")}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <FolderDraggableProvider folderId={String(entry.folder.id)}>
                    {(drag) => (
                      <FolderDroppableProvider droppableId={toFolderDndId(String(entry.folder.id))}>
                        {({ setNodeRef, isOver }) => (
                          <DroppablePulse
                            droppableId={toFolderDndId(String(entry.folder.id))}
                            setNodeRef={setNodeRef}
                            isOver={isOver}
                            pulseNonce={
                              dropSuccessPulse?.droppableId ===
                              toFolderDndId(String(entry.folder.id))
                                ? dropSuccessPulse.nonce
                                : null
                            }
                            className="block w-full"
                          >
                            <Dropdown
                              trigger={["contextMenu"]}
                              menu={{
                                items: [
                                  {
                                    key: "create",
                                    label: t("assets:ASSET_ACTION_CREATE_FOLDER"),
                                    icon: <FolderPlus size={16} />,
                                  },
                                  {
                                    key: "edit",
                                    label: t("assets:ASSET_ACTION_EDIT_FOLDER"),
                                    icon: <PencilLine size={16} />,
                                  },
                                  {
                                    key: "move_folder",
                                    label: t("assets:ASSET_ACTION_MOVE_FOLDER"),
                                    icon: <FolderInput size={16} />,
                                  },
                                  { type: "divider" },
                                  {
                                    key: "delete",
                                    label: t("assets:ASSET_ACTION_DELETE_FOLDER"),
                                    icon: <Trash2 size={16} />,
                                    danger: true,
                                  },
                                ],
                                onClick: ({ key, domEvent }) => {
                                  domEvent.preventDefault();
                                  domEvent.stopPropagation();
                                  if (key === "create") {
                                    setCreateFolderParentId(String(entry.folder.id));
                                    setCreateFolderOpen(true);
                                    return;
                                  }
                                  if (key === "edit") {
                                    setEditFolderTarget(entry.folder);
                                    setEditFolderOpen(true);
                                    return;
                                  }
                                  if (key === "move_folder") {
                                    setMoveFolderTarget(entry.folder);
                                    setMoveFolderOpen(true);
                                    return;
                                  }
                                  if (key === "delete") {
                                    void tryDeleteFolder(entry.folder);
                                  }
                                },
                              }}
                            >
                              <div
                                onContextMenuCapture={() => {
                                  // Focus the folder on right-click so actions (e.g. delete) match user's expectation.
                                  flushSync(() => {
                                    setFocusedFolderId(entry.folder.id);
                                    setSelection((prev) => clearSelection(prev));
                                    setActive(null);
                                  });
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                }}
                              >
                                <div
                                  ref={drag.setNodeRef}
                                  role="button"
                                  tabIndex={0}
                                  data-folder-tile="true"
                                  className={cn(
                                    "group relative w-full overflow-hidden border border-border/50 bg-card",
                                    "rounded-lg shadow-sm transition duration-200 hover:shadow-md",
                                    "cursor-pointer outline-none",
                                    "select-none",
                                    focusedFolderId === entry.folder.id
                                      ? "ring-1 ring-foreground/60"
                                      : null,
                                    isOver ? "ring-1 ring-foreground/60" : null,
                                  )}
                                  {...(drag.attributes as Record<string, unknown>)}
                                  {...(drag.listeners as Record<string, unknown>)}
                                  onClick={() => {
                                    setFocusedFolderId(entry.folder.id);
                                    setSelection((prev) => clearSelection(prev));
                                    setActive(null);
                                  }}
                                  onDoubleClick={() => {
                                    setCurrentFolderId(entry.folder.id);
                                    setFocusedFolderId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key !== "Enter") return;
                                    setCurrentFolderId(entry.folder.id);
                                    setFocusedFolderId(null);
                                  }}
                                >
                                  <div
                                    className="relative w-full overflow-hidden"
                                    style={{ aspectRatio: 4 / 3 }}
                                  >
                                    <div className="absolute inset-0 bg-muted/10">
                                      <div className="absolute inset-0 bg-linear-to-b from-primary/25 via-transparent to-transparent" />
                                      <div className="relative flex h-full flex-col justify-between p-4">
                                        <div className="flex items-center gap-2 ">
                                          <Folder size={18} className="opacity-80" />
                                          <span className="font-bold text-lg tracking-wide">
                                            {t("assets:ASSET_FOLDER")}
                                          </span>
                                        </div>
                                        <div className="min-w-0">
                                          <div
                                            className="font-semibold truncate"
                                            title={entry.folder.name}
                                          >
                                            {entry.folder.name}
                                          </div>
                                          {entry.folder.description ? (
                                            <div
                                              className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground/80"
                                              title={entry.folder.description}
                                            >
                                              {entry.folder.description}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </Dropdown>
                          </DroppablePulse>
                        )}
                      </FolderDroppableProvider>
                    )}
                  </FolderDraggableProvider>
                );
              }}
            />
          </div>

          <DragOverlay modifiers={[snapOverlayCenterToPointer]}>
            <AnimatePresence>
              {draggingAssetIds.length > 0 ? (
                <DragSelectionOverlay
                  count={draggingAssetIds.length}
                  key="drag-selection-overlay"
                />
              ) : draggingFolderId ? (
                <DragFolderOverlay
                  key="drag-folder-overlay"
                  folderLabel={t("assets:ASSET_FOLDER")}
                  folderName={
                    folderById.get(String(draggingFolderId))?.name || t("assets:ASSET_FOLDER")
                  }
                />
              ) : null}
            </AnimatePresence>
          </DragOverlay>
        </DndContext>
      </PageState>

      {assetsQuery.hasNextPage ? (
        <div ref={sentinelRef} className="py-8 flex justify-center">
          {assetsQuery.isFetchingNextPage ? <LoaderOne /> : <div className="h-6 w-6" />}
        </div>
      ) : null}

      <AnimatePresence>
        {selectedIds.size > 0 ? (
          <motion.div
            key="assets-selection-toolbar"
            className="fixed bottom-0 right-0 left-[240px] z-30 pointer-events-none"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <div className="pointer-events-auto w-full border-t border-border bg-card shadow-[0_-16px_30px_-24px_rgba(0,0,0,0.28)]">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                    {t("assets:ASSET_SELECTED_COUNT", { count: selectedIds.size })}
                  </div>
                  <Button
                    type="text"
                    className="!h-8 !px-2"
                    onClick={() => {
                      setSelection((prev) => clearSelection(prev));
                    }}
                  >
                    {t("assets:ASSET_CLEAR_SELECTION")}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="text"
                    icon={<FolderInput size={16} />}
                    onClick={() => setMoveModalOpen(true)}
                    disabled={bulkMoveMutation.isPending}
                  >
                    {t("assets:ASSET_ACTION_MOVE")}
                  </Button>
                  <Button
                    type="text"
                    icon={<Settings2 size={16} />}
                    onClick={() => openEditAccessDialog()}
                    disabled={bulkUpdateMutation.isPending}
                  >
                    {t("assets:ASSET_ACTION_EDIT_ACCESS")}
                  </Button>
                  <Button
                    type="primary"
                    danger
                    icon={<Trash2 size={16} />}
                    onClick={() => openBulkDeleteDialog()}
                    disabled={bulkDeleteMutation.isPending}
                  >
                    {t("assets:ASSET_ACTION_DELETE_SELECTED")}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </DefaultPage>
  );
}
