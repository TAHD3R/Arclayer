import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buildContentModelsQueryKey, createContentModel, listContentModels } from "@/api/content";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError } from "@/lib/notifications";
import {
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";
import { Button } from "@arclayer/ui/button";

import { buildContentModelsTableColumns } from "./components/content-models-table-columns";
import { ContentModelsToolbar } from "./components/content-models-toolbar";
import { CreateContentTypeDialog } from "./components/create-content-type-dialog";
import type {
  ContentModelsFilters,
  ContentModelsTableQuery,
  ContentModelsTableRow,
  CreateContentTypeSubmitValues,
} from "./types";
import { toContentModelsTableQuery } from "./utils";

type ContentModelsControlCenterPageProps = {
  projectId: string;
};

export function ContentModelsControlCenterPage({ projectId }: ContentModelsControlCenterPageProps) {
  const { t } = useTranslation(["content", "common"]);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ContentModelsFilters>({});
  const tableId = React.useMemo(() => `project-content-models:${projectId}`, [projectId]);
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId });
  const dateTime = useAdminDateTimeFormatter({ projectId });

  const createMutation = useMutation({
    mutationFn: (values: CreateContentTypeSubmitValues) =>
      createContentModel(projectId, values.payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: ["dataTable", tableId] }),
      ]);
      setCreateOpen(false);
    },
    onError: notifyError,
  });

  const columns = React.useMemo(
    () =>
      buildContentModelsTableColumns({
        t,
        formatDateTime: (value) => dateTime.formatDateTime(value, { emptyValue: "" }),
      }),
    [dateTime.formatDateTime, t],
  );

  const tableQuery = React.useMemo(() => toContentModelsTableQuery(filters), [filters]);
  const tableHook = useDataTable<ContentModelsTableRow, ContentModelsTableQuery>({
    tableId,
    columns,
    fetcher: (params) => listContentModels(projectId, params),
    extraQuery: tableQuery,
    initialState: {
      pageSize: 50,
      sorting: [{ id: "updatedAt", desc: true }],
    },
    storage: {
      visibility: { keyPrefix: "arclayer:admin:dataTable:visibility", version: "v3" },
      preferences: { keyPrefix: "arclayer:admin:dataTable:preferences", version: "v3" },
    },
  });

  const hasActiveQuery = Boolean(tableHook.searchInput.trim()) || Object.keys(filters).length > 0;
  const toolbar = (
    <ContentModelsToolbar
      t={t}
      table={tableHook.table}
      searchInput={tableHook.searchInput}
      onSearchInputChange={tableHook.setSearchInput}
      filters={filters}
      onFiltersChange={setFilters}
      rowHeight={rowHeight}
      onRowHeightChange={setRowHeight}
      wrapHeaders={wrapHeaders}
      onWrapHeadersChange={setWrapHeaders}
      onRefresh={() => void tableHook.refetch()}
      refreshing={tableHook.isFetching && !tableHook.isLoading}
      onResetColumnVisibility={tableHook.resetColumnVisibility}
    />
  );

  return (
    <>
      <DefaultPage
        title={t("CONTENT_MODELS_TITLE")}
        showFavoriteToggle
        action={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            {t("CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION")}
          </Button>
        }
      >
        <AdminDataTableSection
          table={tableHook.table}
          emptyText={t("content:CONTENT_MODELS_TABLE_EMPTY_TEXT")}
          emptyTitle={
            hasActiveQuery
              ? t("content:CONTENT_MODELS_EMPTY_SEARCH_TITLE")
              : t("content:CONTENT_MODELS_EMPTY_TITLE")
          }
          emptyDescription={
            hasActiveQuery
              ? t("content:CONTENT_MODELS_EMPTY_SEARCH_DESC")
              : t("content:CONTENT_MODELS_EMPTY_DESC")
          }
          emptyExtra={
            hasActiveQuery ? (
              <Button
                variant="default"
                onClick={() => {
                  tableHook.setSearchInput("");
                  setFilters({});
                }}
              >
                {t("content:CONTENT_MODELS_FILTER_RESET")}
              </Button>
            ) : null
          }
          loading={tableHook.isLoading}
          error={tableHook.error}
          onRetry={() => void tableHook.refetch()}
          infiniteScroll={tableHook.infiniteScroll}
          t={t}
          rowHeight={rowHeight}
          wrapHeaders={wrapHeaders}
          refreshing={tableHook.isFetching && !tableHook.isLoading}
          toolbar={toolbar}
        />
      </DefaultPage>
      <CreateContentTypeDialog
        open={createOpen}
        pending={createMutation.isPending}
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />
    </>
  );
}
