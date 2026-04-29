import * as React from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  buildContentModelsQueryKey,
  createContentModel,
  deleteContentModel,
  listAllContentModels,
  listContentModels,
} from "@/api/content";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  rangeSelect,
  selectOrClearOnPlainClick,
  toggleSelect,
  type AssetSelectionState,
} from "@/lib/assets/asset-selection";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";
import { Button } from "@arclayer/ui/button";

import { ContentModelsActionDialogs } from "./components/content-models-action-dialogs";
import { ContentModelEditScreen } from "./components/content-model-edit-screen";
import { ContentModelsSelectionToolbar } from "./components/content-models-selection-toolbar";
import { buildContentModelsTableColumns } from "./components/content-models-table-columns";
import { ContentModelsToolbar } from "./components/content-models-toolbar";
import { CreateContentTypeDialog } from "./components/create-content-type-dialog";
import type {
  ContentModelsFilters,
  ContentModelsTableQuery,
  ContentModelsTableRow,
  CreateContentTypeSubmitValues,
} from "./types";
import { buildDuplicateContentModelPayload, toContentModelsTableQuery } from "./utils";

type ContentModelsControlCenterPageProps = {
  projectId: string;
};

function readModelTableSelection(
  rowSelection: RowSelectionState,
  lastActiveId: string | null,
): AssetSelectionState {
  const selectedIds = new Set<string>();
  for (const [id, selected] of Object.entries(rowSelection)) {
    if (selected) selectedIds.add(id);
  }
  return {
    selectedIds,
    lastActiveId,
  };
}

function writeModelTableSelection(selection: AssetSelectionState): RowSelectionState {
  return Object.fromEntries(Array.from(selection.selectedIds, (id) => [id, true]));
}

export function ContentModelsControlCenterPage({ projectId }: ContentModelsControlCenterPageProps) {
  const { t } = useTranslation(["content", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const canManageModels = permissionAccess.hasAction("project:content:models:write");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editModel, setEditModel] = React.useState<ContentModelsTableRow | null>(null);
  const [duplicateModel, setDuplicateModel] = React.useState<ContentModelsTableRow | null>(null);
  const [bulkDuplicateOpen, setBulkDuplicateOpen] = React.useState(false);
  const [deleteModelState, setDeleteModelState] = React.useState<ContentModelsTableRow | null>(
    null,
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<ContentModelsFilters>({});
  const [lastSelectedModelId, setLastSelectedModelId] = React.useState<string | null>(null);
  const tableId = React.useMemo(() => `project-content-models:${projectId}`, [projectId]);
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId });
  const dateTime = useAdminDateTimeFormatter({ projectId });

  const refreshModels = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: ["dataTable", tableId] }),
    ]);
  }, [projectId, queryClient, tableId]);

  const createMutation = useMutation({
    mutationFn: (values: CreateContentTypeSubmitValues) =>
      createContentModel(projectId, values.payload),
    onSuccess: async () => {
      await refreshModels();
      setCreateOpen(false);
    },
    onError: notifyError,
  });

  const duplicateMutation = useMutation({
    mutationFn: async (model: ContentModelsTableRow) => {
      const existingModels = await listAllContentModels(projectId);
      return createContentModel(
        projectId,
        buildDuplicateContentModelPayload({ model, existingModels, t }),
      );
    },
    onSuccess: async (model) => {
      await refreshModels();
      setDuplicateModel(null);
      setEditModel(model);
      notifySuccessText(t("content:CONTENT_MODELS_DUPLICATE_SUCCESS"));
    },
    onError: notifyError,
  });

  const bulkDuplicateMutation = useMutation({
    mutationFn: async (models: ContentModelsTableRow[]) => {
      const existingModels = await listAllContentModels(projectId);
      const knownModels = [...existingModels];
      const payloads = models.map((model) => {
        const payload = buildDuplicateContentModelPayload({
          model,
          existingModels: knownModels,
          t,
        });
        knownModels.push({
          ...model,
          singularKey: payload.singularKey,
          pluralKey: payload.pluralKey,
          name: payload.name,
        });
        return payload;
      });

      return Promise.all(payloads.map((payload) => createContentModel(projectId, payload)));
    },
    onSuccess: async (models) => {
      await refreshModels();
      setBulkDuplicateOpen(false);
      tableHook.table.resetRowSelection();
      setLastSelectedModelId(null);
      if (models[0]) setEditModel(models[0]);
      notifySuccessText(
        t("content:CONTENT_MODELS_BULK_DUPLICATE_SUCCESS", { count: models.length }),
      );
    },
    onError: notifyError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (modelId: string) => deleteContentModel(projectId, modelId),
    onError: notifyError,
  });

  const columns = React.useMemo(
    () =>
      buildContentModelsTableColumns({
        t,
        canManageModels,
        pending:
          duplicateMutation.isPending ||
          bulkDuplicateMutation.isPending ||
          deleteMutation.isPending,
        formatDateTime: (value) => dateTime.formatDateTime(value, { emptyValue: "" }),
        onEdit: setEditModel,
        onDuplicate: setDuplicateModel,
        onDelete: setDeleteModelState,
      }),
    [
      bulkDuplicateMutation.isPending,
      canManageModels,
      dateTime.formatDateTime,
      deleteMutation.isPending,
      duplicateMutation.isPending,
      t,
    ],
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
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.id,
    },
    storage: {
      visibility: { keyPrefix: "arclayer:admin:dataTable:visibility", version: "v3" },
      preferences: { keyPrefix: "arclayer:admin:dataTable:preferences", version: "v3" },
    },
  });

  const selectedModels = tableHook.table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedCount = selectedModels.length;
  const hasActiveQuery = Boolean(tableHook.searchInput.trim()) || Object.keys(filters).length > 0;
  const orderedModelIds = tableHook.table.getRowModel().rows.map((row) => row.original.id);
  const handleRowClick = React.useCallback(
    (
      model: ContentModelsTableRow,
      event: Pick<
        React.MouseEvent<HTMLTableRowElement>,
        "detail" | "metaKey" | "ctrlKey" | "shiftKey" | "preventDefault"
      >,
    ) => {
      if (event.detail >= 2) {
        event.preventDefault();
        setEditModel(model);
        return;
      }

      const currentSelection = readModelTableSelection(
        tableHook.table.getState().rowSelection,
        lastSelectedModelId,
      );
      const nextSelection = event.shiftKey
        ? rangeSelect(currentSelection, model.id, orderedModelIds)
        : event.metaKey || event.ctrlKey
          ? toggleSelect(currentSelection, model.id)
          : selectOrClearOnPlainClick(currentSelection, model.id, event.detail);

      tableHook.table.setRowSelection(writeModelTableSelection(nextSelection));
      setLastSelectedModelId(nextSelection.lastActiveId);
    },
    [lastSelectedModelId, orderedModelIds, tableHook.table],
  );
  const toolbar = (
    <ContentModelsToolbar
      t={t}
      table={tableHook.table}
      sorting={tableHook.sorting}
      onSortingChange={tableHook.setSorting}
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
          <Button type="button" disabled={!canManageModels} onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            {t("CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION")}
          </Button>
        }
      >
        {!canManageModels ? (
          <AccessNoticeAlert
            className="mb-4"
            description={t("content:CONTENT_MODELS_NO_ACCESS_DESC")}
            data-testid="content-models-no-access"
          />
        ) : null}
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
          rowClassName={(row) =>
            row.getIsSelected()
              ? "select-none cursor-pointer bg-accent/35 hover:bg-accent/45"
              : "select-none cursor-pointer"
          }
          onRowClick={(row, _rowIndex, event) => handleRowClick(row.original, event)}
        />
      </DefaultPage>
      <ContentModelsSelectionToolbar
        t={t}
        selectedCount={selectedCount}
        canManageModels={canManageModels}
        duplicatePending={bulkDuplicateMutation.isPending}
        deletePending={deleteMutation.isPending}
        onClearSelection={() => {
          tableHook.table.resetRowSelection();
          setLastSelectedModelId(null);
        }}
        onOpenDuplicate={() => setBulkDuplicateOpen(true)}
        onOpenDelete={() => setBulkDeleteOpen(true)}
      />
      <CreateContentTypeDialog
        open={createOpen}
        pending={createMutation.isPending}
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />
      <ContentModelsActionDialogs
        duplicateDialog={{
          row: duplicateModel,
          pending: duplicateMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !duplicateMutation.isPending) setDuplicateModel(null);
          },
          onConfirm: async () => {
            if (!duplicateModel) return;
            await duplicateMutation.mutateAsync(duplicateModel);
          },
        }}
        deleteDialog={{
          row: deleteModelState,
          pending: deleteMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !deleteMutation.isPending) setDeleteModelState(null);
          },
          onConfirm: async () => {
            const targetModel = deleteModelState;
            if (!targetModel) return;
            await deleteMutation.mutateAsync(targetModel.id);
            await refreshModels();
            if (editModel?.id === targetModel.id) setEditModel(null);
            setDeleteModelState(null);
            tableHook.table.resetRowSelection();
            setLastSelectedModelId(null);
            notifySuccessText(t("content:CONTENT_MODELS_DELETE_SUCCESS"));
          },
        }}
        bulkDuplicateDialog={{
          count: selectedCount,
          open: bulkDuplicateOpen,
          pending: bulkDuplicateMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !bulkDuplicateMutation.isPending) setBulkDuplicateOpen(false);
          },
          onConfirm: async () => {
            const targets = selectedModels;
            await bulkDuplicateMutation.mutateAsync(targets);
          },
        }}
        bulkDeleteDialog={{
          count: selectedCount,
          open: bulkDeleteOpen,
          pending: deleteMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !deleteMutation.isPending) setBulkDeleteOpen(false);
          },
          onConfirm: async () => {
            const targets = selectedModels;
            await Promise.all(targets.map((model) => deleteMutation.mutateAsync(model.id)));
            await refreshModels();
            if (editModel && targets.some((model) => model.id === editModel.id)) setEditModel(null);
            setBulkDeleteOpen(false);
            tableHook.table.resetRowSelection();
            setLastSelectedModelId(null);
            notifySuccessText(
              t("content:CONTENT_MODELS_BULK_DELETE_SUCCESS", { count: targets.length }),
            );
          },
        }}
      />
      <ContentModelEditScreen
        projectId={projectId}
        model={editModel}
        canManageModels={canManageModels}
        pending={
          duplicateMutation.isPending || bulkDuplicateMutation.isPending || deleteMutation.isPending
        }
        onDuplicate={setDuplicateModel}
        onDelete={setDeleteModelState}
        onModelChange={setEditModel}
        onRefreshModels={refreshModels}
        onClose={() => setEditModel(null)}
      />
    </>
  );
}
