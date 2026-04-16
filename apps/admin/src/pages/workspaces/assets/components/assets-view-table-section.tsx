import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { DataPaginationControls } from "@/components/common/data-pagination-controls";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import {
  clearSelection,
  rangeSelect,
  selectOrClearOnPlainClick,
  toggleSelect,
} from "@/lib/assets/asset-selection";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
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
}): ColumnDef<AssetMasonryItem, unknown>[] {
  const { formatCreatedAt, isSelected, onMoreAction, onToggleAllVisible, onToggleRowSelected, t } =
    params;

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
          <Checkbox
            checked={isSelected(row.original.id)}
            aria-label={t("common:SELECT") || "Select"}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={() => onToggleRowSelected(row.original.id)}
          />
        </div>
      ),
    },
    {
      id: "name",
      accessorKey: "name",
      meta: { title: t("assets:ASSET_EDIT_FILENAME"), kind: "primary" },
      header: t("assets:ASSET_EDIT_FILENAME"),
      cell: ({ row }) => (
        <AssetPreviewCell
          asset={row.original}
          subtitle={buildAssetFilenameSubtitle(row.original, t)}
        />
      ),
      size: 360,
      minSize: 260,
    },
    {
      id: "uploadedBy",
      accessorFn: (asset) => asset.uploaderName || "",
      meta: { title: t("assets:ASSET_META_UPLOADED_BY"), kind: "meta" },
      header: t("assets:ASSET_META_UPLOADED_BY"),
      cell: ({ row }) => <AssetUploaderCell asset={row.original} t={t} />,
      size: 220,
      minSize: 180,
    },
    {
      id: "mime",
      accessorFn: (asset) => getMimeLabel(asset.mimeType, t),
      meta: { title: t("assets:ASSET_META_MIME"), defaultHidden: true, kind: "meta" },
      header: t("assets:ASSET_META_MIME"),
      cell: ({ row }) => <AssetMimeCell asset={row.original} t={t} />,
      size: 150,
      minSize: 120,
    },
    {
      id: "visibility",
      accessorFn: (asset) => getVisibilityLabel(asset.visibility, t),
      meta: { title: t("assets:ASSET_META_VISIBILITY"), defaultHidden: true, kind: "status" },
      header: t("assets:ASSET_META_VISIBILITY"),
      cell: ({ row }) => <AssetVisibilityCell asset={row.original} t={t} />,
      size: 140,
      minSize: 120,
    },
    {
      id: "purpose",
      accessorKey: "purpose",
      meta: { title: t("assets:ASSET_META_PURPOSE"), kind: "meta" },
      header: t("assets:ASSET_META_PURPOSE"),
      cell: ({ row }) => <AssetPurposeCell asset={row.original} t={t} />,
      size: 150,
      minSize: 120,
    },
    {
      id: "size",
      accessorFn: (asset) => asset.sizeBytes ?? 0,
      meta: { title: t("assets:ASSET_META_SIZE"), defaultHidden: true, kind: "meta" },
      header: t("assets:ASSET_META_SIZE"),
      cell: ({ row }) => row.original.sizeText || "-",
      size: 120,
      minSize: 100,
    },
    {
      id: "createdAt",
      accessorFn: (asset) => asset.createdAt || "",
      meta: { title: t("assets:ASSET_META_CREATED_AT"), kind: "time" },
      header: t("assets:ASSET_META_CREATED_AT"),
      cell: ({ row }) => formatCreatedAt(row.original.createdAt),
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
          <AssetActionsCell asset={row.original} t={t} onMoreAction={onMoreAction} />
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

export function useAssetsViewTableController(controller: AssetsViewController) {
  const t = controller.t;
  const visibilityStorage = useMemo(
    () => ({ keyPrefix: "arclayer:admin:dataTable:visibility", version: "v3" as const }),
    [],
  );
  const dateTime = useWorkspaceDateTimeFormatter({
    workspaceId: controller.workspaceId ?? undefined,
  });
  const tableId = useMemo(
    () => `workspace-assets:${controller.workspaceId ?? "none"}`,
    [controller.workspaceId],
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
    setActive: controller.setActive,
    openEditAssetDialog: controller.openEditAssetDialog,
    openAssetEditAccessDialog: controller.openAssetEditAccessDialog,
    openAssetDeleteDialog: controller.openAssetDeleteDialog,
  });

  itemsRef.current = controller.items;
  orderedAssetIdsRef.current = controller.orderedAssetIds;
  selectedIdsRef.current = controller.selectedIds;
  actionsRef.current = {
    setActive: controller.setActive,
    openEditAssetDialog: controller.openEditAssetDialog,
    openAssetEditAccessDialog: controller.openAssetEditAccessDialog,
    openAssetDeleteDialog: controller.openAssetDeleteDialog,
  };

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

  const handleRowClick = useCallback(
    (asset: AssetMasonryItem, event: MouseEvent<HTMLTableRowElement>) => {
      controller.setFocusedFolderId(null);
      if (event.shiftKey) {
        controller.setSelection((prev) => rangeSelect(prev, asset.id, orderedAssetIdsRef.current));
      } else if (event.metaKey || event.ctrlKey) {
        controller.setSelection((prev) => toggleSelect(prev, asset.id));
      } else {
        controller.setSelection((prev) => selectOrClearOnPlainClick(prev, asset.id, event.detail));
      }

      if (event.detail < 2) return;
      event.preventDefault();
      controller.setActive(asset);
    },
    [controller.setActive, controller.setFocusedFolderId, controller.setSelection],
  );

  const handleMoreAction = useCallback(
    (key: Parameters<typeof handleAssetMoreAction>[0]["key"], asset: AssetMasonryItem) => {
      const nextActions = actionsRef.current;
      void handleAssetMoreAction({
        key,
        asset,
        publicUrl: asset.publicUrl || null,
        t,
        onOpenDetails: () => nextActions.setActive(asset),
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
      }),
    [
      formatCreatedAt,
      handleMoreAction,
      handleToggleAllVisible,
      handleToggleRowSelected,
      isSelected,
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
    data: controller.items,
    columns,
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
    refreshing: controller.pagedAssetsQuery.isFetching && !controller.pagedAssetsQuery.isLoading,
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
  const pageData = controller.pagedAssetsQuery.data ?? null;
  const isLoading = controller.pagedAssetsQuery.isLoading && !controller.pagedAssetsQuery.data;
  const isEmpty = !isLoading && controller.items.length === 0;

  return (
    <ContentGuard
      loading={isLoading}
      loadingVariant="table"
      error={controller.pagedAssetsQuery.isError ? controller.pagedAssetsQuery.error : null}
      onRetry={() => void controller.pagedAssetsQuery.refetch()}
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
          footer={
            pageData ? (
              <DataPaginationControls
                page={pageData.page}
                size={pageData.size}
                total={pageData.total}
                onChange={(nextPage, nextSize) => {
                  if (nextSize !== controller.pageSize) {
                    controller.setPageSize(nextSize);
                    controller.setPage(1);
                    return;
                  }
                  controller.setPage(nextPage);
                }}
                t={controller.t}
              />
            ) : undefined
          }
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
            controller.selectedIds.has(row.original.id)
              ? "select-none bg-accent/35 hover:bg-accent/45"
              : "select-none"
          }
          onRowClick={(row, _rowIndex, event) => props.onRowClick(row.original, event)}
        />
      </div>
    </ContentGuard>
  );
}
