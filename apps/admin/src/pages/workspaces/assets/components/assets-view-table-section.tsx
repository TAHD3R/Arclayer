import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { CornerUpLeft, FolderClosed, MoreVertical, PencilLine, Trash2 } from "lucide-react";
import {
  type ColumnPinningState,
  type ColumnDef,
  type Updater,
  type VisibilityState,
  functionalUpdate,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import {
  clearSelection,
  rangeSelect,
  selectOrClearOnPlainClick,
  toggleSelect,
} from "@/lib/assets/asset-selection";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import type { AdminAssetFolder } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import {
  clearVisibilityState,
  DataTablePresenter,
  resolveDefaultColumnPinning,
  readVisibilityState,
  resolveDefaultColumnVisibility,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
  writeVisibilityState,
} from "@arclayer/ui/data-table";

import type { AssetsViewController } from "../hooks/use-assets-view-controller";
import { handleAssetMoreAction } from "./asset-more-actions";
import {
  ASSET_TABLE_ACTIONS_COLUMN_WIDTH,
  ASSET_TABLE_SELECT_COLUMN_WIDTH,
  AssetActionsCell,
  AssetMimeCell,
  AssetPreviewCell,
  AssetPurposeCell,
  AssetUploaderCell,
  AssetVisibilityCell,
  buildAssetFilenameSubtitle,
} from "./assets-view-table-cells";
import { getMimeLabel, getVisibilityLabel } from "./asset-masonry-tile";
import {
  DND_ROOT_ID,
  DroppablePulse,
  FolderDroppableProvider,
  toFolderDndId,
} from "./assets-view-dnd";

type AssetsTableRow =
  | {
      kind: "folderUp";
      key: string;
      parentFolderId: string | null;
      parentFolderName: string | null;
    }
  | {
      kind: "folder";
      key: string;
      folder: AdminAssetFolder;
    }
  | {
      kind: "asset";
      key: string;
      asset: AssetMasonryItem;
    };

function toAssetRow(row: AssetsTableRow): AssetMasonryItem | null {
  return row.kind === "asset" ? row.asset : null;
}

function EmptyValueCell() {
  return <span className="text-label-tertiary">-</span>;
}

const folderTableIconClassName =
  "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/5 text-label-secondary dark:bg-white/5 dark:text-label-primary";

function FolderNameCell(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  folder: AdminAssetFolder;
  dropPulseNonce: number | null;
}) {
  const droppableId = toFolderDndId(String(props.folder.id));

  return (
    <FolderDroppableProvider droppableId={droppableId}>
      {({ setNodeRef, isOver }) => (
        <DroppablePulse
          droppableId={droppableId}
          setNodeRef={setNodeRef}
          isOver={isOver}
          pulseNonce={props.dropPulseNonce}
          className="w-full"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className={folderTableIconClassName}>
              <FolderClosed className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-callout font-semibold text-label-primary">
                {props.folder.name}
              </div>
              {props.folder.description ? (
                <div className="truncate text-footnote text-label-secondary">
                  {props.folder.description}
                </div>
              ) : null}
            </div>
          </div>
        </DroppablePulse>
      )}
    </FolderDroppableProvider>
  );
}

function FolderUpNameCell(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  parentFolderId: string | null;
  parentFolderName: string | null;
  dropPulseNonce: number | null;
}) {
  const droppableId = props.parentFolderId ? toFolderDndId(props.parentFolderId) : DND_ROOT_ID;

  return (
    <FolderDroppableProvider droppableId={droppableId}>
      {({ setNodeRef, isOver }) => (
        <DroppablePulse
          droppableId={droppableId}
          setNodeRef={setNodeRef}
          isOver={isOver}
          pulseNonce={props.dropPulseNonce}
          className="w-full"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className={folderTableIconClassName}>
              <CornerUpLeft className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-callout font-semibold text-label-primary">
                {props.t("assets:ASSET_FOLDER_UP")}
              </div>
              <div className="truncate text-footnote text-label-secondary">
                {props.parentFolderName ?? props.t("assets:ASSET_BREADCRUMB_ROOT")}
              </div>
            </div>
          </div>
        </DroppablePulse>
      )}
    </FolderDroppableProvider>
  );
}

function FolderActionsCell(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  folder: AdminAssetFolder;
  canManageAssets?: boolean;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
}) {
  const canManageAssets = props.canManageAssets !== false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={props.t("common:MORE")}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuIconItem
          icon={<PencilLine className="size-4" />}
          disabled={!canManageAssets}
          onSelect={() => props.onEditFolder(props.folder)}
        >
          {props.t("assets:ASSET_ACTION_EDIT_FOLDER")}
        </DropdownMenuIconItem>
        <DropdownMenuIconItem
          icon={<FolderClosed className="size-4" />}
          disabled={!canManageAssets}
          onSelect={() => props.onMoveFolder(props.folder)}
        >
          {props.t("assets:ASSET_ACTION_MOVE_FOLDER")}
        </DropdownMenuIconItem>
        <DropdownMenuSeparator />
        <DropdownMenuIconItem
          icon={<Trash2 className="size-4" />}
          variant="destructive"
          disabled={!canManageAssets}
          onSelect={() => props.onDeleteFolder(props.folder)}
        >
          {props.t("assets:ASSET_ACTION_DELETE_FOLDER")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function buildAssetsTableColumns(params: {
  t: (key: string, options?: Record<string, unknown>) => string;
  formatCreatedAt: (iso: string | undefined) => string;
  onToggleAllVisible: () => void;
  onToggleRowSelected: (assetId: string) => void;
  isSelected: (assetId: string) => boolean;
  onMoreAction: (
    key: Parameters<typeof handleAssetMoreAction>[0]["key"],
    asset: AssetMasonryItem,
  ) => void;
  canManageAssets?: boolean;
  getDropPulseNonce: (droppableId: string) => number | null;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
}): ColumnDef<AssetsTableRow, unknown>[] {
  const {
    canManageAssets,
    formatCreatedAt,
    getDropPulseNonce,
    isSelected,
    onDeleteFolder,
    onEditFolder,
    onMoreAction,
    onMoveFolder,
    onToggleAllVisible,
    onToggleRowSelected,
    t,
  } = params;

  return [
    {
      id: "select",
      enableHiding: false,
      size: ASSET_TABLE_SELECT_COLUMN_WIDTH,
      minSize: ASSET_TABLE_SELECT_COLUMN_WIDTH,
      maxSize: ASSET_TABLE_SELECT_COLUMN_WIDTH,
      meta: { title: "", kind: "select", headerAlign: "center" },
      header: () => (
        <div className="flex w-full items-center justify-center">
          <Checkbox
            checked={isSelected("__all__")}
            aria-label={t("common:SELECT_ALL") || "Select all"}
            onCheckedChange={onToggleAllVisible}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex w-full items-center justify-center">
          {(() => {
            const asset = toAssetRow(row.original);
            return asset ? (
              <Checkbox
                checked={isSelected(asset.id)}
                aria-label={t("common:SELECT") || "Select"}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={() => onToggleRowSelected(asset.id)}
              />
            ) : null;
          })()}
        </div>
      ),
    },
    {
      id: "name",
      accessorFn: (row) =>
        row.kind === "asset"
          ? row.asset.name
          : row.kind === "folder"
            ? row.folder.name
            : row.parentFolderName || "",
      meta: { title: t("assets:ASSET_EDIT_FILENAME"), kind: "primary" },
      header: t("assets:ASSET_EDIT_FILENAME"),
      cell: ({ row }) => {
        if (row.original.kind === "folder") {
          return (
            <FolderNameCell
              t={t}
              folder={row.original.folder}
              dropPulseNonce={getDropPulseNonce(toFolderDndId(String(row.original.folder.id)))}
            />
          );
        }
        if (row.original.kind === "folderUp") {
          const droppableId = row.original.parentFolderId
            ? toFolderDndId(row.original.parentFolderId)
            : DND_ROOT_ID;
          return (
            <FolderUpNameCell
              t={t}
              parentFolderId={row.original.parentFolderId}
              parentFolderName={row.original.parentFolderName}
              dropPulseNonce={getDropPulseNonce(droppableId)}
            />
          );
        }
        return (
          <AssetPreviewCell
            asset={row.original.asset}
            subtitle={buildAssetFilenameSubtitle(row.original.asset, t)}
          />
        );
      },
      size: 360,
      minSize: 260,
    },
    {
      id: "uploadedBy",
      accessorFn: (row) => toAssetRow(row)?.uploaderName || "",
      meta: { title: t("assets:ASSET_META_UPLOADED_BY"), kind: "meta" },
      header: t("assets:ASSET_META_UPLOADED_BY"),
      cell: ({ row }) => {
        const asset = toAssetRow(row.original);
        return asset ? <AssetUploaderCell asset={asset} t={t} /> : <EmptyValueCell />;
      },
      size: 220,
      minSize: 180,
    },
    {
      id: "mime",
      accessorFn: (row) => {
        const asset = toAssetRow(row);
        return asset ? getMimeLabel(asset.mimeType, t) : "";
      },
      meta: { title: t("assets:ASSET_META_MIME"), defaultHidden: true, kind: "meta" },
      header: t("assets:ASSET_META_MIME"),
      cell: ({ row }) => {
        const asset = toAssetRow(row.original);
        return asset ? <AssetMimeCell asset={asset} t={t} /> : <EmptyValueCell />;
      },
      size: 150,
      minSize: 120,
    },
    {
      id: "visibility",
      accessorFn: (row) => {
        const asset = toAssetRow(row);
        return asset ? getVisibilityLabel(asset.visibility, t) : "";
      },
      meta: { title: t("assets:ASSET_META_VISIBILITY"), defaultHidden: true, kind: "status" },
      header: t("assets:ASSET_META_VISIBILITY"),
      cell: ({ row }) => {
        const asset = toAssetRow(row.original);
        return asset ? <AssetVisibilityCell asset={asset} t={t} /> : <EmptyValueCell />;
      },
      size: 140,
      minSize: 120,
    },
    {
      id: "purpose",
      accessorFn: (row) => toAssetRow(row)?.purpose ?? "",

      meta: { title: t("assets:ASSET_META_PURPOSE"), defaultHidden: true, kind: "meta" },
      header: t("assets:ASSET_META_PURPOSE"),
      cell: ({ row }) => {
        const asset = toAssetRow(row.original);
        return asset ? <AssetPurposeCell asset={asset} t={t} /> : <EmptyValueCell />;
      },
      size: 150,
      minSize: 120,
    },
    {
      id: "size",
      accessorFn: (row) => toAssetRow(row)?.sizeBytes ?? 0,
      meta: { title: t("assets:ASSET_META_SIZE"), defaultHidden: true, kind: "meta" },
      header: t("assets:ASSET_META_SIZE"),
      cell: ({ row }) => toAssetRow(row.original)?.sizeText || <EmptyValueCell />,
      size: 120,
      minSize: 100,
    },
    {
      id: "createdAt",
      accessorFn: (row) => toAssetRow(row)?.createdAt || "",
      meta: { title: t("assets:ASSET_META_CREATED_AT"), kind: "time" },
      header: t("assets:ASSET_META_CREATED_AT"),
      cell: ({ row }) => {
        const asset = toAssetRow(row.original);
        return asset ? formatCreatedAt(asset.createdAt) : <EmptyValueCell />;
      },
      size: 180,
      minSize: 160,
    },
    {
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      size: ASSET_TABLE_ACTIONS_COLUMN_WIDTH,
      minSize: ASSET_TABLE_ACTIONS_COLUMN_WIDTH,
      maxSize: ASSET_TABLE_ACTIONS_COLUMN_WIDTH,
      meta: buildDataTableActionsColumnMeta("center"),
      header: "",
      cell: ({ row }) => (
        <DataTableActionsCell align="center">
          {row.original.kind === "folder" ? (
            <FolderActionsCell
              t={t}
              folder={row.original.folder}
              canManageAssets={canManageAssets}
              onEditFolder={onEditFolder}
              onMoveFolder={onMoveFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ) : row.original.kind === "asset" ? (
            <AssetActionsCell asset={row.original.asset} t={t} onMoreAction={onMoreAction} />
          ) : null}
        </DataTableActionsCell>
      ),
    },
  ];
}

function areVisibilityStatesEqual(a: VisibilityState, b: VisibilityState) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? true) !== (b[key] ?? true)) return false;
  }
  return true;
}

function areColumnPinningStatesEqual(a: ColumnPinningState, b: ColumnPinningState) {
  const leftA = a.left ?? [];
  const leftB = b.left ?? [];
  const rightA = a.right ?? [];
  const rightB = b.right ?? [];
  if (leftA.length !== leftB.length || rightA.length !== rightB.length) return false;
  for (let index = 0; index < leftA.length; index += 1) {
    if (leftA[index] !== leftB[index]) return false;
  }
  for (let index = 0; index < rightA.length; index += 1) {
    if (rightA[index] !== rightB[index]) return false;
  }
  return true;
}

export function useAssetsViewTableController(
  controller: AssetsViewController,
  options: { canManageAssets?: boolean } = {},
) {
  const t = controller.t;
  const visibilityStorage = useMemo(
    () => ({ keyPrefix: "arclayer:admin:dataTable:visibility", version: "v3" as const }),
    [],
  );
  const dateTime = useAdminDateTimeFormatter({
    projectId: controller.projectId ?? undefined,
  });
  const tableId = useMemo(
    () => `project-assets:${controller.projectId ?? "none"}`,
    [controller.projectId],
  );
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId });
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const allVisibleSelectedRef = useRef(false);
  const dateTimeRef = useRef(dateTime.formatDateTime);
  const itemsRef = useRef(controller.items);
  const orderedAssetIdsRef = useRef(controller.orderedAssetIds);
  const selectedIdsRef = useRef(controller.selectedIds);
  const actionsRef = useRef({
    openAssetDetails: controller.openAssetDetails,
    openEditAssetDialog: controller.openEditAssetDialog,
    openAssetEditAccessDialog: controller.openAssetEditAccessDialog,
    openAssetDeleteDialog: controller.openAssetDeleteDialog,
  });
  const folderActionsRef = useRef({
    setCurrentFolderId: controller.setCurrentFolderId,
    setFocusedFolderId: controller.setFocusedFolderId,
    setActive: controller.setActive,
    setEditFolderTarget: controller.setEditFolderTarget,
    setEditFolderOpen: controller.setEditFolderOpen,
    setMoveFolderTarget: controller.setMoveFolderTarget,
    setMoveFolderOpen: controller.setMoveFolderOpen,
    openDeleteFolderDialog: controller.openDeleteFolderDialog,
  });

  itemsRef.current = controller.items;
  orderedAssetIdsRef.current = controller.orderedAssetIds;
  selectedIdsRef.current = controller.selectedIds;
  actionsRef.current = {
    openAssetDetails: controller.openAssetDetails,
    openEditAssetDialog: controller.openEditAssetDialog,
    openAssetEditAccessDialog: controller.openAssetEditAccessDialog,
    openAssetDeleteDialog: controller.openAssetDeleteDialog,
  };
  folderActionsRef.current = {
    setCurrentFolderId: controller.setCurrentFolderId,
    setFocusedFolderId: controller.setFocusedFolderId,
    setActive: controller.setActive,
    setEditFolderTarget: controller.setEditFolderTarget,
    setEditFolderOpen: controller.setEditFolderOpen,
    setMoveFolderTarget: controller.setMoveFolderTarget,
    setMoveFolderOpen: controller.setMoveFolderOpen,
    openDeleteFolderDialog: controller.openDeleteFolderDialog,
  };

  const tableRows = useMemo<AssetsTableRow[]>(() => {
    const rows: AssetsTableRow[] = [];
    if (controller.assetLibraryHasContent) {
      const parentFolder = controller.currentFolderId
        ? (controller.folderPath.at(-2) ?? null)
        : null;
      for (const entry of controller.folderEntries) {
        if (entry.kind === "folderUp") {
          rows.push({
            kind: "folderUp",
            key: "folder-up",
            parentFolderId: parentFolder ? String(parentFolder.id) : null,
            parentFolderName: parentFolder?.name ?? null,
          });
          continue;
        }
        if (entry.kind === "folder") {
          rows.push({
            kind: "folder",
            key: `folder:${String(entry.folder.id)}`,
            folder: entry.folder,
          });
        }
      }
    }
    for (const asset of controller.items) {
      rows.push({
        kind: "asset",
        key: `asset:${asset.id}`,
        asset,
      });
    }
    return rows;
  }, [
    controller.assetLibraryHasContent,
    controller.currentFolderId,
    controller.folderEntries,
    controller.folderPath,
    controller.items,
  ]);

  const allVisibleSelected = useMemo(
    () =>
      controller.items.length > 0 &&
      controller.items.every((asset) => controller.selectedIds.has(asset.id)),
    [controller.items, controller.selectedIds],
  );
  allVisibleSelectedRef.current = allVisibleSelected;
  dateTimeRef.current = dateTime.formatDateTime;

  const handleToggleAllVisible = useCallback(() => {
    const visibleItems = itemsRef.current;
    const visibleSelected =
      visibleItems.length > 0 &&
      visibleItems.every((asset) => selectedIdsRef.current.has(asset.id));

    if (visibleSelected) {
      controller.setSelection((prev) => clearSelection(prev));
      controller.setFocusedFolderId(null);
      return;
    }

    const orderedIds = visibleItems.map((asset) => asset.id);
    controller.setSelection({
      selectedIds: new Set(orderedIds),
      lastActiveId: orderedIds.at(-1) ?? null,
    });
    controller.setFocusedFolderId(null);
  }, [controller.setFocusedFolderId, controller.setSelection]);

  const handleToggleRowSelected = useCallback(
    (assetId: string) => {
      controller.setSelection((prev) => toggleSelect(prev, assetId));
    },
    [controller.setSelection],
  );

  const isSelected = useCallback((assetId: string) => {
    if (assetId === "__all__") return allVisibleSelectedRef.current;
    return selectedIdsRef.current.has(assetId);
  }, []);

  const formatCreatedAt = useCallback(
    (iso: string | undefined) => dateTimeRef.current(iso, { emptyValue: "-" }),
    [],
  );

  const handleSelectFolder = useCallback((folderId: string | null) => {
    const nextActions = folderActionsRef.current;
    nextActions.setCurrentFolderId(folderId);
    nextActions.setFocusedFolderId(folderId);
    nextActions.setActive(null);
  }, []);

  const handleEditFolder = useCallback((folder: AdminAssetFolder) => {
    const nextActions = folderActionsRef.current;
    nextActions.setEditFolderTarget(folder);
    nextActions.setEditFolderOpen(true);
  }, []);

  const handleMoveFolder = useCallback((folder: AdminAssetFolder) => {
    const nextActions = folderActionsRef.current;
    nextActions.setMoveFolderTarget(folder);
    nextActions.setMoveFolderOpen(true);
  }, []);

  const handleDeleteFolder = useCallback((folder: AdminAssetFolder) => {
    folderActionsRef.current.openDeleteFolderDialog(folder);
  }, []);

  const getDropPulseNonce = useCallback(
    (droppableId: string) =>
      controller.dropSuccessPulse?.droppableId === droppableId
        ? controller.dropSuccessPulse.nonce
        : null,
    [controller.dropSuccessPulse],
  );

  const handleRowClick = useCallback(
    (row: AssetsTableRow | AssetMasonryItem, event: MouseEvent<HTMLTableRowElement>) => {
      const tableRow =
        "kind" in row ? row : ({ kind: "asset", key: `asset:${row.id}`, asset: row } as const);
      if (tableRow.kind === "folder") {
        handleSelectFolder(String(tableRow.folder.id));
        return;
      }
      if (tableRow.kind === "folderUp") {
        handleSelectFolder(tableRow.parentFolderId);
        return;
      }
      const asset = tableRow.asset;
      controller.setFocusedFolderId(null);
      if (event.detail >= 2) {
        event.preventDefault();
        controller.openAssetDetails(asset);
        return;
      }
      if (event.shiftKey) {
        controller.setSelection((prev) => rangeSelect(prev, asset.id, orderedAssetIdsRef.current));
      } else if (event.metaKey || event.ctrlKey) {
        controller.setSelection((prev) => toggleSelect(prev, asset.id));
      } else {
        controller.setSelection((prev) => selectOrClearOnPlainClick(prev, asset.id, event.detail));
      }
    },
    [
      controller.openAssetDetails,
      controller.setFocusedFolderId,
      controller.setSelection,
      handleSelectFolder,
    ],
  );

  const handleMoreAction = useCallback(
    (key: Parameters<typeof handleAssetMoreAction>[0]["key"], asset: AssetMasonryItem) => {
      const nextActions = actionsRef.current;
      void handleAssetMoreAction({
        key,
        asset,
        publicUrl: asset.publicUrl || null,
        t,
        onOpenDetails: () => nextActions.openAssetDetails(asset),
        onOpenEditAsset: () => nextActions.openEditAssetDialog(asset),
        onOpenEditAccess: () => nextActions.openAssetEditAccessDialog(asset),
        onOpenDelete: () => nextActions.openAssetDeleteDialog(asset),
      });
    },
    [t],
  );

  const columns = useMemo(
    () =>
      buildAssetsTableColumns({
        t,
        formatCreatedAt,
        onToggleAllVisible: handleToggleAllVisible,
        onToggleRowSelected: handleToggleRowSelected,
        isSelected,
        onMoreAction: handleMoreAction,
        canManageAssets: options.canManageAssets,
        getDropPulseNonce,
        onEditFolder: handleEditFolder,
        onMoveFolder: handleMoveFolder,
        onDeleteFolder: handleDeleteFolder,
      }),
    [
      formatCreatedAt,
      getDropPulseNonce,
      handleDeleteFolder,
      handleEditFolder,
      handleMoreAction,
      handleMoveFolder,
      handleToggleAllVisible,
      handleToggleRowSelected,
      isSelected,
      options.canManageAssets,
      t,
    ],
  );
  const defaultColumnPinning = useMemo(() => resolveDefaultColumnPinning(columns), [columns]);
  const [columnPinning, setColumnPinning] = useState(() => defaultColumnPinning);

  const loadInitialColumnVisibility = useCallback(() => {
    const persisted = readVisibilityState(tableId, visibilityStorage);
    if (persisted) return persisted;
    return resolveDefaultColumnVisibility(columns);
  }, [columns, tableId, visibilityStorage]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    loadInitialColumnVisibility(),
  );

  useEffect(() => {
    const nextVisibility = loadInitialColumnVisibility();
    setColumnVisibility((prev) =>
      areVisibilityStatesEqual(prev, nextVisibility) ? prev : nextVisibility,
    );
    setColumnPinning((prev) =>
      areColumnPinningStatesEqual(prev, defaultColumnPinning) ? prev : defaultColumnPinning,
    );
  }, [defaultColumnPinning, loadInitialColumnVisibility, tableId]);

  const handleColumnVisibilityChange = useCallback(
    (updater: Updater<VisibilityState>) => {
      setColumnVisibility((prev) => {
        const next = functionalUpdate(updater, prev);
        writeVisibilityState(tableId, next, visibilityStorage);
        return next;
      });
    },
    [tableId, visibilityStorage],
  );

  const table = useReactTable({
    data: tableRows,
    columns,
    getRowId: (row) => row.key,
    getCoreRowModel: getCoreRowModel(),
    enableColumnPinning: true,
    state: { columnVisibility, columnOrder, columnPinning },
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: setColumnPinning,
  });

  const resetColumnVisibility = useCallback(() => {
    clearVisibilityState(tableId, visibilityStorage);
    setColumnVisibility(resolveDefaultColumnVisibility(columns));
    setColumnPinning(defaultColumnPinning);
    setColumnOrder([]);
  }, [columns, defaultColumnPinning, tableId, visibilityStorage]);

  return {
    table,
    rowHeight,
    setRowHeight,
    wrapHeaders,
    setWrapHeaders,
    toolsLabels: buildDataTableToolsLabels(t),
    resetColumnVisibility,
    refreshing: controller.assetsQuery.isFetching && !controller.assetsQuery.isLoading,
    onRowClick: handleRowClick,
  };
}

export function AssetsViewTableSection(props: {
  controller: AssetsViewController;
  table: ReturnType<typeof useAssetsViewTableController>["table"];
  rowHeight: ReturnType<typeof useAssetsViewTableController>["rowHeight"];
  wrapHeaders: boolean;
  refreshing: boolean;
  onRowClick: ReturnType<typeof useAssetsViewTableController>["onRowClick"];
}) {
  const { controller, table } = props;
  const isLoading = controller.assetsQuery.isLoading && !controller.assetsQuery.data;
  const isEmpty = !isLoading && table.getRowModel().rows.length === 0;

  return (
    <ContentGuard
      loading={isLoading}
      loadingVariant="table"
      error={controller.assetsQuery.isError ? controller.assetsQuery.error : null}
      onRetry={() => void controller.assetsQuery.refetch()}
      empty={isEmpty}
      emptyTitle={
        controller.explicitFilterActive
          ? controller.t("assets:ASSET_EMPTY_SEARCH_TITLE")
          : controller.t("assets:ASSET_EMPTY")
      }
      emptyDescription={
        controller.explicitFilterActive
          ? controller.t("assets:ASSET_EMPTY_SEARCH_DESC")
          : controller.t("assets:ASSET_EMPTY_DESC")
      }
      emptyExtra={
        controller.explicitFilterActive ? (
          <Button
            variant="default"
            onClick={() => {
              controller.setSearchInput("");
              controller.setSearchQuery("");
              controller.setFilters({ visibility: "public" });
              controller.setMoreOpen(false);
            }}
          >
            {controller.t("assets:ASSET_FILTER_RESET")}
          </Button>
        ) : null
      }
      className="flex min-h-0 flex-col"
    >
      <div className="flex min-h-0 flex-col gap-4">
        <DataTablePresenter
          table={table}
          className="min-h-0 flex-1"
          emptyText={controller.t("common:EMPTY_DESC")}
          infiniteScroll={{
            hasMore: Boolean(controller.assetsQuery.hasNextPage),
            loadingMore: controller.assetsQuery.isFetchingNextPage,
            loadMoreError: controller.assetsQuery.isFetchNextPageError
              ? controller.assetsQuery.error
              : undefined,
            onLoadMore: () => {
              if (
                controller.assetsQuery.isFetchingNextPage ||
                !controller.assetsQuery.hasNextPage
              ) {
                return;
              }
              controller.assetsQuery.fetchNextPage().catch(() => undefined);
            },
            loadingMoreLabel: controller.t("common:DATA_TABLE_LOADING_MORE"),
            loadMoreErrorLabel: controller.t("common:DATA_TABLE_LOAD_MORE_ERROR"),
          }}
          rowHeight={props.rowHeight}
          wrapHeaders={props.wrapHeaders}
          refreshing={props.refreshing}
          refreshingLabel={controller.t("common:DATA_TABLE_REFRESHING")}
          columnMenuLabels={{
            sort: controller.t("common:DATA_TABLE_SORT"),
            filter: controller.t("common:DATA_TABLE_FILTER"),
            sortAscending: controller.t("common:DATA_TABLE_SORT_ASCENDING"),
            sortDescending: controller.t("common:DATA_TABLE_SORT_DESCENDING"),
            wrapContent: controller.t("common:DATA_TABLE_WRAP_CONTENT"),
            unwrapContent: controller.t("common:DATA_TABLE_UNWRAP_CONTENT"),
            hide: controller.t("common:DATA_TABLE_HIDE"),
          }}
          rowClassName={(row) =>
            row.original.kind === "asset" && controller.selectedIds.has(row.original.asset.id)
              ? "select-none bg-accent/35 hover:bg-accent/45"
              : "select-none"
          }
          onRowClick={(row, _rowIndex, event) => props.onRowClick(row.original, event)}
        />
      </div>
    </ContentGuard>
  );
}
