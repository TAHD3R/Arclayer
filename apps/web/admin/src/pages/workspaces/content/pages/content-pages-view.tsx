import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ColumnDef } from "@tanstack/react-table";
import { Button, Pagination } from "antd";
import { Plus } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceSitePage,
  deleteWorkspaceSitePage,
  getWorkspaceSitePageDraftRevision,
  getWorkspaceSitePagePublishedRevision,
  listWorkspaceSitePagesTree,
  patchWorkspaceSitePage,
  saveWorkspaceSitePageDraft,
} from "@/api/workspace-site";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { DataTablePresenter, useDataTable } from "@/components/data-table";
import { ApiError } from "@/lib/http";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import { buildContentPagesColumns } from "./content-pages-columns";
import { ContentPagesBulkActions } from "./content-pages-bulk-actions";
import { ContentPagesConfirmDialogs } from "./content-pages-confirm-dialogs";
import { ContentPagesSheet } from "./content-pages-sheet";
import { ContentPagesToolbar } from "./content-pages-toolbar";
import type {
  ContentPageFormValues,
  ContentPageRow,
  ContentPageSheetMode,
  ContentPagesFilters,
} from "./content-pages-types";
import {
  buildDuplicatePath,
  buildDuplicateTitle,
  mapTreeToRows,
  normalizePathInput,
  sortRows,
  validatePathWithType,
} from "./content-pages-utils";

function tableId(workspaceId: string | null): string {
  return `workspace-content-pages:${workspaceId ?? "none"}`;
}

function toApiFilters(filters: ContentPagesFilters): {
  status?: ContentPagesFilters["status"] extends "all" ? never : ContentPagesFilters["status"];
  visibility?:
    | (ContentPagesFilters["visibility"] extends "all" ? never : ContentPagesFilters["visibility"])
    | undefined;
} {
  return {
    status: filters.status === "all" ? undefined : filters.status,
    visibility: filters.visibility === "all" ? undefined : filters.visibility,
  };
}

async function resolveSourceRevision(workspaceId: string, pageId: string) {
  try {
    return await getWorkspaceSitePageDraftRevision(workspaceId, pageId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return getWorkspaceSitePagePublishedRevision(workspaceId, pageId);
    }
    throw error;
  }
}

export function ContentPagesView() {
  const { t } = useTranslation(["content_pages", "nav", "common"]);
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const navigate = useNavigate();
  const dateTime = useAdminDateTimeFormatter({ workspaceId });

  const [filters, setFilters] = React.useState<ContentPagesFilters>({
    status: "all",
    visibility: "all",
  });
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetMode, setSheetMode] = React.useState<ContentPageSheetMode>("create");
  const [editingRow, setEditingRow] = React.useState<ContentPageRow | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = React.useState<ContentPageRow | null>(null);
  const [deleteCandidates, setDeleteCandidates] = React.useState<ContentPageRow[] | null>(null);

  const [processingIds, setProcessingIds] = React.useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = React.useState<null | "delete" | "duplicate" | "visibility">(
    null,
  );

  const pagesTreeQuery = useQuery({
    queryKey: ["site", "pages", "tree", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSitePagesTree(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const setRowProcessing = React.useCallback((rowId: string, processing: boolean) => {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      if (processing) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }, []);

  const openEditor = React.useCallback(
    (row: ContentPageRow) => {
      if (!workspaceId) return;
      void navigate({
        to: "/w/$workspaceId/editor/$editorMode/$entityId",
        params: {
          workspaceId: String(workspaceId),
          editorMode: "page",
          entityId: row.id,
        },
        search: { pathname: row.path },
      });
    },
    [navigate, workspaceId],
  );

  const extraQuery = React.useMemo(() => toApiFilters(filters), [filters]);

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      mode: ContentPageSheetMode;
      values: ContentPageFormValues;
      targetId?: string;
    }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");

      const normalizedPath = normalizePathInput(payload.values.path);
      const mismatch = validatePathWithType(normalizedPath, payload.values.type);
      if (mismatch) throw new Error(t("content_pages:VALIDATION_PATH_TYPE_MISMATCH"));

      const normalizedTitle = (payload.values.title ?? "").trim();
      const normalizedDescription = (payload.values.description ?? "").trim();

      const commonPayload = {
        title: normalizedTitle || null,
        description: normalizedDescription || null,
        path: normalizedPath,
        parentId: payload.values.parentId,
        visibility: payload.values.visibility,
      } as const;

      if (payload.mode === "create") {
        const created = await createWorkspaceSitePage(String(workspaceId), commonPayload);

        if (payload.values.contentMode === "copy" && payload.values.sourcePageId) {
          const source = await resolveSourceRevision(
            String(workspaceId),
            payload.values.sourcePageId,
          );
          await saveWorkspaceSitePageDraft(String(workspaceId), created.id, {
            document: source.document,
            meta: source.meta ?? null,
            styleOverrides: source.styleOverrides ?? null,
            variantId: source.variantId ?? null,
            deps: source.deps ?? null,
            expectedRevision: 0,
          });
        }

        return created;
      }

      if (!payload.targetId) throw new Error("TARGET_PAGE_REQUIRED");
      return patchWorkspaceSitePage(String(workspaceId), payload.targetId, commonPayload);
    },
    onSuccess: (_data, payload) => {
      notifySuccessText(
        payload.mode === "create"
          ? t("content_pages:TOAST_CREATE_SUCCESS")
          : t("content_pages:TOAST_UPDATE_SUCCESS"),
      );
      setSheetOpen(false);
      setEditingRow(null);
      void queryClient.invalidateQueries({ queryKey: ["dataTable", tableId(String(workspaceId))] });
      void queryClient.invalidateQueries({ queryKey: ["site", "pages", "tree", workspaceId] });
    },
    onError: (error) => notifyError(error),
  });

  const columns = React.useMemo<ColumnDef<ContentPageRow, unknown>[]>(
    () =>
      buildContentPagesColumns({
        t,
        formatUpdatedAt: (value) => (value ? dateTime.formatDateTime(value) : null),
        processingIds,
        onOpenEditor: openEditor,
        onEdit: (row) => {
          setSheetMode("edit");
          setEditingRow(row);
          setSheetOpen(true);
        },
        onDuplicate: (row) => setDuplicateCandidate(row),
        onDelete: (row) => setDeleteCandidates([row]),
      }),
    [dateTime, openEditor, processingIds, t],
  );

  const tableHook = useDataTable<
    ContentPageRow,
    {
      status?: ContentPagesFilters["status"] extends "all" ? never : ContentPagesFilters["status"];
      visibility?: ContentPagesFilters["visibility"] extends "all"
        ? never
        : ContentPagesFilters["visibility"];
    }
  >({
    tableId: tableId(workspaceId ? String(workspaceId) : null),
    columns,
    extraQuery,
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.id,
    },
    features: {
      columnPinning: {
        enabled: true,
      },
    },
    initialState: {
      pageSize: 10,
      sorting: [{ id: "updatedAt", desc: true }],
    },
    fetcher: async (params) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");

      const tree = await listWorkspaceSitePagesTree(String(workspaceId));
      const rows = mapTreeToRows(tree.items);
      const q = (params.q || "").trim().toLowerCase();

      const filtered = rows.filter((row) => {
        if (params.status && row.status !== params.status) return false;
        if (params.visibility && row.visibility !== params.visibility) return false;

        if (!q) return true;

        const title = row.title || "";
        const description = row.description || "";
        const updatedBy = row.updatedBy;
        const updatedName = updatedBy?.displayName || "";
        const updatedEmail = updatedBy?.email || "";

        return [title, description, row.path, updatedName, updatedEmail].some((value) =>
          value.toLowerCase().includes(q),
        );
      });

      const sorted = sortRows(filtered, params.ordering);

      const total = sorted.length;
      const page = Math.max(1, params.page || 1);
      const size = Math.max(1, params.size || 10);
      const pages = Math.ceil(total / size);
      const start = (page - 1) * size;
      const items = sorted.slice(start, start + size);

      return {
        items,
        total,
        page,
        size,
        pages,
        next: page < pages ? page + 1 : null,
        prev: page > 1 && pages > 0 ? page - 1 : null,
      };
    },
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const table = tableHook.table;
  const pageData = tableHook.pageData;
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedCount = selectedRows.length;

  React.useEffect(() => {
    table.setColumnPinning((prev) => {
      const left = ["select"];
      const right: string[] = [];

      const leftSame =
        (prev.left ?? []).length === left.length &&
        left.every((value, index) => prev.left?.[index] === value);
      const rightSame =
        (prev.right ?? []).length === right.length &&
        right.every((value, index) => prev.right?.[index] === value);

      if (leftSame && rightSame) return prev;
      return { left, right };
    });
  }, [table]);

  const resetFilters = React.useCallback(() => {
    setFilters({
      status: "all",
      visibility: "all",
    });
  }, []);

  const allRows = React.useMemo(
    () => mapTreeToRows(pagesTreeQuery.data?.items ?? []),
    [pagesTreeQuery.data?.items],
  );

  const runSingleDuplicate = async (row: ContentPageRow): Promise<boolean> => {
    if (!workspaceId) return false;

    setRowProcessing(row.id, true);
    try {
      const tree = await listWorkspaceSitePagesTree(String(workspaceId));
      const rows = mapTreeToRows(tree.items);
      const existingPaths = new Set(rows.map((item) => item.path));
      const duplicatedPath = buildDuplicatePath(row.path, existingPaths);

      const created = await createWorkspaceSitePage(String(workspaceId), {
        title: buildDuplicateTitle(row.title, row.path),
        description: row.description,
        path: duplicatedPath,
        parentId: row.parentId,
        sortOrder: row.sortOrder,
        visibility: row.visibility,
      });

      const source = await resolveSourceRevision(String(workspaceId), row.id);
      await saveWorkspaceSitePageDraft(String(workspaceId), created.id, {
        document: source.document,
        meta: source.meta ?? null,
        styleOverrides: source.styleOverrides ?? null,
        variantId: source.variantId ?? null,
        deps: source.deps ?? null,
        expectedRevision: 0,
      });

      notifySuccessText(t("content_pages:TOAST_DUPLICATE_SUCCESS"));
      void queryClient.invalidateQueries({ queryKey: ["dataTable", tableId(String(workspaceId))] });
      void queryClient.invalidateQueries({ queryKey: ["site", "pages", "tree", workspaceId] });
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    } finally {
      setRowProcessing(row.id, false);
    }
  };

  const runDeleteRows = async (rows: ContentPageRow[]): Promise<boolean> => {
    if (!workspaceId || !rows.length) return false;

    if (rows.length === 1) {
      const row = rows[0];
      setRowProcessing(row.id, true);
      try {
        await deleteWorkspaceSitePage(String(workspaceId), row.id);
        notifySuccessText(t("content_pages:TOAST_DELETE_SUCCESS"));
        void queryClient.invalidateQueries({
          queryKey: ["dataTable", tableId(String(workspaceId))],
        });
        void queryClient.invalidateQueries({ queryKey: ["site", "pages", "tree", workspaceId] });
        return true;
      } catch (error) {
        notifyError(error);
        return false;
      } finally {
        setRowProcessing(row.id, false);
      }
    }

    setBulkAction("delete");
    try {
      await Promise.all(rows.map((row) => deleteWorkspaceSitePage(String(workspaceId), row.id)));
      notifySuccessText(t("content_pages:TOAST_BULK_DELETE_SUCCESS"));
      table.resetRowSelection();
      void queryClient.invalidateQueries({ queryKey: ["dataTable", tableId(String(workspaceId))] });
      void queryClient.invalidateQueries({ queryKey: ["site", "pages", "tree", workspaceId] });
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    } finally {
      setBulkAction(null);
    }
  };

  const runBulkVisibility = async (visibility: "public" | "private") => {
    if (!workspaceId || !selectedRows.length) return;

    setBulkAction("visibility");
    try {
      await Promise.all(
        selectedRows.map((row) =>
          patchWorkspaceSitePage(String(workspaceId), row.id, {
            title: row.title,
            description: row.description,
            path: row.path,
            parentId: row.parentId,
            sortOrder: row.sortOrder,
            visibility,
          }),
        ),
      );
      notifySuccessText(t("content_pages:TOAST_BULK_VISIBILITY_SUCCESS"));
      table.resetRowSelection();
      void queryClient.invalidateQueries({ queryKey: ["dataTable", tableId(String(workspaceId))] });
      void queryClient.invalidateQueries({ queryKey: ["site", "pages", "tree", workspaceId] });
    } catch (error) {
      notifyError(error);
    } finally {
      setBulkAction(null);
    }
  };

  const requestBulkDelete = () => {
    if (!selectedRows.length) return;
    setDeleteCandidates(selectedRows);
  };

  const runBulkDuplicate = async () => {
    if (!workspaceId || !selectedRows.length) return;

    setBulkAction("duplicate");
    try {
      const tree = await listWorkspaceSitePagesTree(String(workspaceId));
      const existingPaths = new Set(mapTreeToRows(tree.items).map((row) => row.path));
      const duplicateTargets = selectedRows.map((row) => {
        const duplicatedPath = buildDuplicatePath(row.path, existingPaths);
        existingPaths.add(duplicatedPath);
        return { row, duplicatedPath };
      });

      await Promise.all(
        duplicateTargets.map(async ({ row, duplicatedPath }) => {
          const created = await createWorkspaceSitePage(String(workspaceId), {
            title: buildDuplicateTitle(row.title, row.path),
            description: row.description,
            path: duplicatedPath,
            parentId: row.parentId,
            sortOrder: row.sortOrder,
            visibility: row.visibility,
          });

          const source = await resolveSourceRevision(String(workspaceId), row.id);
          await saveWorkspaceSitePageDraft(String(workspaceId), created.id, {
            document: source.document,
            meta: source.meta ?? null,
            styleOverrides: source.styleOverrides ?? null,
            variantId: source.variantId ?? null,
            deps: source.deps ?? null,
            expectedRevision: 0,
          });
        }),
      );

      notifySuccessText(
        t("content_pages:TOAST_BULK_DUPLICATE_SUCCESS", { count: selectedRows.length }),
      );
      table.resetRowSelection();
      void queryClient.invalidateQueries({ queryKey: ["dataTable", tableId(String(workspaceId))] });
      void queryClient.invalidateQueries({ queryKey: ["site", "pages", "tree", workspaceId] });
    } catch (error) {
      notifyError(error);
    } finally {
      setBulkAction(null);
    }
  };

  const handleConfirmDuplicate = async () => {
    if (!duplicateCandidate) return;
    const ok = await runSingleDuplicate(duplicateCandidate);
    if (ok) setDuplicateCandidate(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidates || deleteCandidates.length === 0) return;
    const ok = await runDeleteRows(deleteCandidates);
    if (ok) setDeleteCandidates(null);
  };

  return (
    <>
      <DefaultPage
        title={t("nav:NAV_CONTENT_PAGES")}
        description={t("content_pages:INDEX_DESC")}
        width="full"
        className="h-full"
        contentClassName="min-h-0 flex flex-col"
        action={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setSheetMode("create");
              setEditingRow(null);
              setSheetOpen(true);
            }}
          >
            {t("content_pages:ACTION_CREATE_PAGE")}
          </Button>
        }
        extra={
          <ContentPagesToolbar
            t={t}
            filters={filters}
            searchInput={tableHook.searchInput}
            onSearchInputChange={tableHook.setSearchInput}
            onFiltersChange={setFilters}
            onResetFilters={resetFilters}
            isFetching={tableHook.isFetching && !tableHook.isLoading}
          />
        }
      >
        <PageState
          loading={tableHook.isLoading}
          error={tableHook.error}
          onRetry={() => void tableHook.refetch()}
          empty={!tableHook.isLoading && !tableHook.error && tableHook.items.length === 0}
          emptyTitle={t("content_pages:INDEX_EMPTY")}
          emptyDescription={t("common:EMPTY_DESC")}
          className={cn("flex-1 min-h-0", selectedCount > 0 ? "pb-24" : "")}
          loadingVariant="table"
        >
          <ContentPagesBulkActions
            t={t}
            selectedCount={selectedCount}
            visibilityLoading={bulkAction === "visibility"}
            duplicateLoading={bulkAction === "duplicate"}
            deleteLoading={bulkAction === "delete"}
            onClearSelection={() => table.resetRowSelection()}
            onSetPublic={() => void runBulkVisibility("public")}
            onSetPrivate={() => void runBulkVisibility("private")}
            onDuplicate={() => void runBulkDuplicate()}
            onDelete={requestBulkDelete}
          />

          <DataTablePresenter
            table={table}
            emptyText={t("content_pages:INDEX_EMPTY")}
            className="flex-1 min-h-0"
            rowClassName={(row, rowIndex) => {
              const selected = row.getIsSelected()
                ? "bg-muted/40"
                : rowIndex % 2 === 1
                  ? "bg-muted/20"
                  : "";
              return cn(selected, "hover:bg-muted/40 transition-colors cursor-pointer");
            }}
            onRowClick={(row) => openEditor(row.original)}
          />

          {pageData ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="text-muted-foreground text-sm">
                {t("content_pages:PAGINATION_TOTAL", {
                  total: pageData.total,
                  from: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
                  to: Math.min(pageData.page * pageData.size, pageData.total),
                })}
              </div>
              <Pagination
                current={pageData.page}
                pageSize={pageData.size}
                total={pageData.total}
                showSizeChanger
                pageSizeOptions={[10, 20, 50, 100]}
                onChange={(nextPage, nextSize) => {
                  if (
                    typeof nextSize === "number" &&
                    nextSize !== table.getState().pagination.pageSize
                  ) {
                    table.setPageSize(nextSize);
                  }
                  table.setPageIndex(Math.max(0, nextPage - 1));
                }}
              />
            </div>
          ) : null}
        </PageState>
      </DefaultPage>

      <ContentPagesSheet
        t={t}
        open={sheetOpen}
        mode={sheetMode}
        editingRow={editingRow}
        pages={allRows}
        submitting={submitMutation.isPending}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditingRow(null);
        }}
        onSubmit={async (values) => {
          await submitMutation.mutateAsync({
            mode: sheetMode,
            values,
            targetId: editingRow?.id,
          });
        }}
      />

      <ContentPagesConfirmDialogs
        t={t}
        duplicateRow={duplicateCandidate}
        duplicateLoading={Boolean(duplicateCandidate && processingIds.has(duplicateCandidate.id))}
        onCloseDuplicate={() => setDuplicateCandidate(null)}
        onConfirmDuplicate={() => void handleConfirmDuplicate()}
        deleteRows={deleteCandidates}
        deleteLoading={Boolean(
          deleteCandidates &&
          (deleteCandidates.length > 1
            ? bulkAction === "delete"
            : processingIds.has(deleteCandidates[0]?.id ?? "")),
        )}
        onCloseDelete={() => setDeleteCandidates(null)}
        onConfirmDelete={() => void handleConfirmDelete()}
      />
    </>
  );
}
