import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  type ColumnDef,
  type Updater,
  type VisibilityState,
  functionalUpdate,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { ContentGuard } from "@/components/common/content-guard";
import { DataPaginationControls } from "@/components/common/data-pagination-controls";
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
  controller: AssetsViewController;
  t: (key: string, options?: Record<string, unknown>) => string;
  dateTime: ReturnType<typeof useWorkspaceDateTimeFormatter>;
  allVisibleSelected: boolean;
  onToggleAllVisible: () => void;
  onMoreAction: (
    key: Parameters<typeof handleAssetMoreAction>[0]["key"],
    asset: AssetMasonryItem,
  ) => void;
}): ColumnDef<AssetMasonryItem, unknown>[] {
  const { allVisibleSelected, controller, dateTime, onMoreAction, onToggleAllVisible, t } = params;

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
            checked={allVisibleSelected}
            aria-label={t("common:SELECT_ALL") || "Select all"}
            onCheckedChange={onToggleAllVisible}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex w-full items-center justify-center">
          <Checkbox
            checked={controller.selectedIds.has(row.original.id)}
            aria-label={t("common:SELECT") || "Select"}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={() =>
              controller.setSelection((prev) => toggleSelect(prev, row.original.id))
            }
          />
        </div>
      ),
    },
    {
      id: "name",
      accessorKey: "name",
      meta: { title: t("assets:ASSET_EDIT_FILENAME") },
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
      meta: { title: t("assets:ASSET_META_UPLOADED_BY") },
      header: t("assets:ASSET_META_UPLOADED_BY"),
      cell: ({ row }) => (
        <AssetUploaderCell
          asset={row.original}
          t={t}
          uploadedAtText={dateTime.formatDateTime(row.original.createdAt, { emptyValue: "-" })}
        />
      ),
      size: 220,
      minSize: 180,
    },
    {
      id: "mime",
      accessorFn: (asset) => getMimeLabel(asset.mimeType, t),
      meta: { title: t("assets:ASSET_META_MIME"), defaultHidden: true },
      header: t("assets:ASSET_META_MIME"),
      cell: ({ row }) => <AssetMimeCell asset={row.original} t={t} />,
      size: 150,
      minSize: 120,
    },
    {
      id: "visibility",
      accessorFn: (asset) => getVisibilityLabel(asset.visibility, t),
      meta: { title: t("assets:ASSET_META_VISIBILITY"), defaultHidden: true },
      header: t("assets:ASSET_META_VISIBILITY"),
      cell: ({ row }) => <AssetVisibilityCell asset={row.original} t={t} />,
      size: 140,
      minSize: 120,
    },
    {
      id: "purpose",
      accessorKey: "purpose",
      meta: { title: t("assets:ASSET_META_PURPOSE"), defaultHidden: true },
      header: t("assets:ASSET_META_PURPOSE"),
      cell: ({ row }) => <AssetPurposeCell asset={row.original} t={t} />,
      size: 150,
      minSize: 120,
    },
    {
      id: "size",
      accessorFn: (asset) => asset.sizeBytes ?? 0,
      meta: { title: t("assets:ASSET_META_SIZE"), defaultHidden: true },
      header: t("assets:ASSET_META_SIZE"),
      cell: ({ row }) => row.original.sizeText || "-",
      size: 120,
      minSize: 100,
    },
    {
      id: "createdAt",
      accessorFn: (asset) => asset.createdAt || "",
      meta: { title: t("assets:ASSET_META_CREATED_AT") },
      header: t("assets:ASSET_META_CREATED_AT"),
      cell: ({ row }) => dateTime.formatDateTime(row.original.createdAt, { emptyValue: "-" }),
      size: 180,
      minSize: 160,
    },
    {
      id: "actions",
      enableHiding: false,
      size: ASSET_TABLE_ACTIONS_COLUMN_WIDTH,
      minSize: ASSET_TABLE_ACTIONS_COLUMN_WIDTH,
      maxSize: ASSET_TABLE_ACTIONS_COLUMN_WIDTH,
      meta: { title: "", kind: "actions", headerAlign: "center" },
      header: "",
      cell: ({ row }) => (
        <div className="flex w-full items-center justify-center">
          <AssetActionsCell
            asset={row.original}
            controller={controller}
            onMoreAction={onMoreAction}
          />
        </div>
      ),
    },
  ];
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

  const allVisibleSelected = useMemo(
    () =>
      controller.items.length > 0 &&
      controller.items.every((asset) => controller.selectedIds.has(asset.id)),
    [controller.items, controller.selectedIds],
  );

  const handleToggleAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      controller.setSelection((prev) => clearSelection(prev));
      controller.setFocusedFolderId(null);
      return;
    }

    const orderedIds = controller.items.map((asset) => asset.id);
    controller.setSelection({
      selectedIds: new Set(orderedIds),
      lastActiveId: orderedIds.at(-1) ?? null,
    });
    controller.setFocusedFolderId(null);
  }, [allVisibleSelected, controller]);

  const handleRowClick = useCallback(
    (asset: AssetMasonryItem, event: MouseEvent<HTMLTableRowElement>) => {
      controller.setFocusedFolderId(null);
      if (event.shiftKey) {
        controller.setSelection((prev) => rangeSelect(prev, asset.id, controller.orderedAssetIds));
      } else if (event.metaKey || event.ctrlKey) {
        controller.setSelection((prev) => toggleSelect(prev, asset.id));
      } else {
        controller.setSelection((prev) => selectOrClearOnPlainClick(prev, asset.id, event.detail));
      }

      if (event.detail < 2) return;
      event.preventDefault();
      controller.setActive(asset);
    },
    [controller],
  );

  const handleMoreAction = useCallback(
    (key: Parameters<typeof handleAssetMoreAction>[0]["key"], asset: AssetMasonryItem) => {
      void handleAssetMoreAction({
        key,
        asset,
        publicUrl: asset.publicUrl || null,
        t,
        onOpenDetails: () => controller.setActive(asset),
        onOpenEditAsset: () => controller.openEditAssetDialog(asset),
        onOpenEditAccess: () => controller.openAssetEditAccessDialog(asset),
        onOpenDelete: () => controller.openAssetDeleteDialog(asset),
      });
    },
    [controller, t],
  );

  const columns = useMemo(
    () =>
      buildAssetsTableColumns({
        controller,
        t,
        dateTime,
        allVisibleSelected,
        onToggleAllVisible: handleToggleAllVisible,
        onMoreAction: handleMoreAction,
      }),
    [allVisibleSelected, controller, dateTime, handleMoreAction, handleToggleAllVisible, t],
  );

  const loadInitialColumnVisibility = useCallback(() => {
    const persisted = readVisibilityState(tableId, visibilityStorage);
    if (persisted) return persisted;
    return resolveDefaultColumnVisibility(columns);
  }, [columns, tableId, visibilityStorage]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    loadInitialColumnVisibility(),
  );

  useEffect(() => {
    setColumnVisibility(loadInitialColumnVisibility());
  }, [tableId]);

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
    state: { columnVisibility, columnOrder },
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onColumnOrderChange: setColumnOrder,
  });

  const resetColumnVisibility = useCallback(() => {
    clearVisibilityState(tableId, visibilityStorage);
    setColumnVisibility(resolveDefaultColumnVisibility(columns));
    setColumnOrder([]);
  }, [columns, tableId, visibilityStorage]);

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
          rowHeight={props.rowHeight}
          wrapHeaders={props.wrapHeaders}
          refreshing={props.refreshing}
          refreshingLabel={controller.t("common:DATA_TABLE_REFRESHING")}
          columnMenuLabels={{
            sortAscending: controller.t("common:DATA_TABLE_SORT_ASCENDING"),
            sortDescending: controller.t("common:DATA_TABLE_SORT_DESCENDING"),
            hideColumn: controller.t("common:DATA_TABLE_HIDE_COLUMN"),
          }}
          rowClassName={(row) =>
            controller.selectedIds.has(row.original.id)
              ? "bg-accent/35 hover:bg-accent/45"
              : undefined
          }
          onRowClick={(row, _rowIndex, event) => props.onRowClick(row.original, event)}
        />

        {pageData ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="text-footnote text-label-secondary">
              {controller.t("team:TEAM_PAGINATION_TOTAL", {
                total: pageData.total,
                start: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
                end: Math.min(pageData.page * pageData.size, pageData.total),
              })}
            </div>
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
          </div>
        ) : null}
      </div>
    </ContentGuard>
  );
}
