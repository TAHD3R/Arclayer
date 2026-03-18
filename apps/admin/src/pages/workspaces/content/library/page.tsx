import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";

import {
  archiveContentItemVersion,
  listAllContentItems,
  listAllContentModels,
} from "@/api/content";
import { AdminDataTableSection } from "@/components/common/admin-data-table-section";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { ColumnsPage } from "@/components/common/columns-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AdminContentModel } from "@/types/api";
import { ContentLibraryRowActions } from "./components/content-library-row-actions";
import { ContentLibrarySidebar } from "./components/content-library-sidebar";
import { ContentLibraryStatusTag } from "./components/content-library-status-tag";
import { ContentLibraryToolbar } from "./components/content-library-toolbar";
import type {
  ContentLibraryScopeId,
  ContentLibraryTableRow,
  ContentLibraryToolbarFilters,
} from "./types";
import {
  buildContentLibraryPageData,
  buildContentLibraryRows,
  buildContentSidebarCounts,
  isScheduledScope,
} from "./utils";

const DEFAULT_SCOPE: ContentLibraryScopeId = "quick:all";

function contentLibraryTableId(workspaceId: string | null): string {
  return `workspace-content-library:${workspaceId || "unknown"}`;
}

function buildItemsQueryKey(workspaceId: string | null) {
  return ["content", "items", "all", workspaceId] as const;
}

function buildModelsQueryKey(workspaceId: string | null) {
  return ["content", "models", "all", workspaceId] as const;
}

export function ContentLibraryPage() {
  const { t } = useTranslation(["content", "common", "nav", "team"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();
  const dateTime = useWorkspaceDateTimeFormatter();

  const [activeScope, setActiveScope] = React.useState<ContentLibraryScopeId>(DEFAULT_SCOPE);
  const [toolbarFilters, setToolbarFilters] = React.useState<ContentLibraryToolbarFilters>({});

  const dataTableId = React.useMemo(
    () => contentLibraryTableId(workspaceId ? String(workspaceId) : null),
    [workspaceId],
  );
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId: dataTableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId: dataTableId });

  const modelsQuery = useQuery({
    queryKey: buildModelsQueryKey(workspaceId ? String(workspaceId) : null),
    enabled: Boolean(workspaceId),
    queryFn: async () => listAllContentModels(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const itemsQuery = useQuery({
    queryKey: buildItemsQueryKey(workspaceId ? String(workspaceId) : null),
    enabled: Boolean(workspaceId),
    queryFn: async () => listAllContentItems(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const models = React.useMemo<AdminContentModel[]>(
    () => [...(modelsQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [modelsQuery.data],
  );
  const rows = React.useMemo<ContentLibraryTableRow[]>(
    () => buildContentLibraryRows(itemsQuery.data ?? [], models),
    [itemsQuery.data, models],
  );
  const sidebarCounts = React.useMemo(() => buildContentSidebarCounts(rows), [rows]);

  React.useEffect(() => {
    if (!activeScope.startsWith("tree:type:")) return;
    const modelKey = activeScope.replace("tree:type:", "");
    if (models.some((model) => model.key === modelKey)) return;
    setActiveScope(DEFAULT_SCOPE);
  }, [activeScope, models]);

  React.useEffect(() => {
    if (!toolbarFilters.modelKey) return;
    if (models.some((model) => model.key === toolbarFilters.modelKey)) return;
    setToolbarFilters((prev) => ({ ...prev, modelKey: undefined }));
  }, [models, toolbarFilters.modelKey]);

  const archiveMutation = useMutation({
    mutationFn: async (row: ContentLibraryTableRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      if (!row.archiveVersionNumber) throw new Error("CONTENT_ITEM_ARCHIVE_VERSION_MISSING");
      return archiveContentItemVersion(String(workspaceId), row.id, row.archiveVersionNumber);
    },
    onSuccess: async () => {
      notifySuccessText(t("content:CONTENT_LIBRARY_ARCHIVE_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: buildItemsQueryKey(workspaceId ? String(workspaceId) : null),
      });
    },
    onError: (error) => notifyError(error),
  });

  const columns = React.useMemo<ColumnDef<ContentLibraryTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { title: t("content:CONTENT_LIBRARY_TABLE_COL_NAME"), sortKey: "name" },
        header: t("content:CONTENT_LIBRARY_TABLE_COL_NAME"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{row.original.name}</div>
            <div className="truncate text-caption text-label-secondary">
              {row.original.slug} · {row.original.locale}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "modelName",
        meta: { title: t("content:CONTENT_LIBRARY_TABLE_COL_TYPE"), sortKey: "modelName" },
        header: t("content:CONTENT_LIBRARY_TABLE_COL_TYPE"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{row.original.modelName}</div>
            <div className="truncate text-caption text-label-secondary">
              {row.original.modelKey}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "updatedAt",
        meta: { title: t("content:CONTENT_LIBRARY_TABLE_COL_UPDATED"), sortKey: "updatedAt" },
        header: t("content:CONTENT_LIBRARY_TABLE_COL_UPDATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDateTimeOrNull(row.original.updatedAt);
          return (
            <span className={formatted ? "" : "text-label-secondary"}>
              {formatted || row.original.updatedAt}
            </span>
          );
        },
      },
      {
        id: "updatedBy",
        meta: { title: t("content:CONTENT_LIBRARY_TABLE_COL_UPDATED_BY") },
        header: t("content:CONTENT_LIBRARY_TABLE_COL_UPDATED_BY"),
        cell: () => (
          <span className="text-label-secondary">
            {t("content:CONTENT_LIBRARY_TABLE_UPDATED_BY_UNAVAILABLE")}
          </span>
        ),
      },
      {
        accessorKey: "derivedStatus",
        meta: { title: t("content:CONTENT_LIBRARY_TABLE_COL_STATUS"), sortKey: "derivedStatus" },
        header: t("content:CONTENT_LIBRARY_TABLE_COL_STATUS"),
        cell: ({ row }) => <ContentLibraryStatusTag status={row.original.derivedStatus} />,
      },
      {
        id: "actions",
        meta: { title: t("content:CONTENT_LIBRARY_TABLE_COL_ACTIONS"), kind: "actions" },
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ContentLibraryRowActions
              row={row.original}
              archivePending={archiveMutation.isPending}
              onArchive={(nextRow) => archiveMutation.mutate(nextRow)}
            />
          </div>
        ),
      },
    ],
    [archiveMutation, dateTime, t],
  );

  const dataReady = Boolean(workspaceId) && !modelsQuery.isLoading && !itemsQuery.isLoading;
  const dataError = modelsQuery.error ?? itemsQuery.error;
  const fingerprint = React.useMemo(
    () =>
      [
        activeScope,
        toolbarFilters.status || "",
        toolbarFilters.modelKey || "",
        rows.length,
        modelsQuery.dataUpdatedAt,
        itemsQuery.dataUpdatedAt,
      ].join("|"),
    [activeScope, itemsQuery.dataUpdatedAt, modelsQuery.dataUpdatedAt, rows.length, toolbarFilters],
  );

  const tableHook = useDataTable<ContentLibraryTableRow, { fingerprint: string }>({
    tableId: dataTableId,
    columns,
    extraQuery: { fingerprint },
    fetcher: async (params) =>
      buildContentLibraryPageData(rows, params, activeScope, toolbarFilters),
    queryOptions: {
      enabled: dataReady && !dataError,
      retry: false,
      meta: { silent: true },
    },
  });

  const emptyTitle = isScheduledScope(activeScope)
    ? t("content:CONTENT_LIBRARY_EMPTY_SCHEDULED_TITLE")
    : t("content:CONTENT_LIBRARY_EMPTY_TITLE");
  const emptyDescription = isScheduledScope(activeScope)
    ? t("content:CONTENT_LIBRARY_EMPTY_SCHEDULED_DESC")
    : t("content:CONTENT_LIBRARY_EMPTY_DESC");
  const toolsLabels = React.useMemo(() => buildDataTableToolsLabels(t), [t]);
  const refreshing =
    tableHook.isFetching ||
    modelsQuery.isFetching ||
    itemsQuery.isFetching ||
    archiveMutation.isPending;

  return (
    <ColumnsPage
      title={t("nav:NAV_CONTENT_LIBRARY")}
      description={t("content:CONTENT_LIBRARY_DESC")}
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      extra={
        <ContentLibraryToolbar
          table={tableHook.table}
          searchInput={tableHook.searchInput}
          onSearchInputChange={tableHook.setSearchInput}
          filters={toolbarFilters}
          onFiltersChange={setToolbarFilters}
          rowHeight={rowHeight}
          onRowHeightChange={setRowHeight}
          wrapHeaders={wrapHeaders}
          onWrapHeadersChange={setWrapHeaders}
          refreshing={refreshing}
          onRefresh={() => {
            void Promise.all([modelsQuery.refetch(), itemsQuery.refetch()]);
          }}
          onResetColumnVisibility={tableHook.resetColumnVisibility}
          toolsLabels={toolsLabels}
          modelOptions={models.map((model) => ({ value: model.key, label: model.name }))}
        />
      }
      sideSlots={{
        right: {
          title: t("content:CONTENT_LIBRARY_PANEL_TITLE"),
          mobileLabel: t("content:CONTENT_LIBRARY_PANEL_TITLE"),
          minWidth: "17rem",
          maxWidth: "24rem",
          defaultWidth: "19rem",
          content: (
            <ContentLibrarySidebar
              activeScope={activeScope}
              counts={sidebarCounts}
              contentTypesLoading={modelsQuery.isLoading}
              models={models}
              onScopeChange={setActiveScope}
            />
          ),
        },
      }}
    >
      <AdminDataTableSection
        table={tableHook.table}
        emptyText={t("content:CONTENT_LIBRARY_EMPTY_TABLE")}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        loading={modelsQuery.isLoading || itemsQuery.isLoading}
        error={dataError}
        onRetry={() => {
          void Promise.all([modelsQuery.refetch(), itemsQuery.refetch()]);
        }}
        pageData={tableHook.pageData}
        onPaginationChange={(nextPage, nextSize) => {
          if (nextSize !== tableHook.table.getState().pagination.pageSize) {
            tableHook.table.setPageSize(nextSize);
          }
          tableHook.table.setPageIndex(Math.max(0, nextPage - 1));
        }}
        t={t}
        rowHeight={rowHeight}
        wrapHeaders={wrapHeaders}
        refreshing={refreshing && !modelsQuery.isLoading && !itemsQuery.isLoading}
      />
    </ColumnsPage>
  );
}
