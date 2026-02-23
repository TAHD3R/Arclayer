import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input, Select, Tag } from "antd";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceSiteEntry,
  createWorkspaceSiteEntryType,
  deleteWorkspaceSiteEntry,
  deleteWorkspaceSiteEntryType,
  listWorkspaceSiteEntries,
  listWorkspaceSiteEntryTypes,
  listWorkspaceSitePagesTree,
  publishWorkspaceSiteEntry,
  type SiteEntry,
  type SiteEntryType,
  type SitePageTreeNode,
  unpublishWorkspaceSiteEntry,
} from "@/api/workspace-site";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type EntryStatus = "draft" | "published";

type EntryRow = SiteEntry & {
  status: EntryStatus;
};

type EntryTypeRow = SiteEntryType & {
  entryCount: number;
};

type PageRow = {
  id: string;
  title: string;
  path: string;
  status: EntryStatus;
  updatedAt: string | null;
};

type LibraryTab = "entries" | "types" | "pages";
type EntriesView = "masonry" | "table";

type CreateEntryFormValues = {
  entryTypeCode: string;
  slug: string;
};

type CreateEntryTypeFormValues = {
  code: string;
  name: string;
};

function flattenPageTree(items: SitePageTreeNode[]): PageRow[] {
  const rows: PageRow[] = [];

  const walk = (nodes: SitePageTreeNode[]) => {
    for (const node of nodes) {
      rows.push({
        id: node.id,
        title: node.title?.trim() || node.path,
        path: node.path,
        status: node.publishedRevision ? "published" : "draft",
        updatedAt: node.updatedAt ?? null,
      });
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(items);
  return rows;
}

export function ContentLibraryView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<LibraryTab>("entries");
  const [entriesView, setEntriesView] = React.useState<EntriesView>("table");

  const [searchText, setSearchText] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | EntryStatus>("all");
  const [entryTypeFilter, setEntryTypeFilter] = React.useState<"all" | string>("all");
  const [pageIndex, setPageIndex] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createTypeOpen, setCreateTypeOpen] = React.useState(false);
  const [processingEntryId, setProcessingEntryId] = React.useState<string | null>(null);
  const [processingTypeId, setProcessingTypeId] = React.useState<string | null>(null);
  const [createForm] = Form.useForm<CreateEntryFormValues>();
  const [createTypeForm] = Form.useForm<CreateEntryTypeFormValues>();

  const entryTypesQuery = useQuery({
    queryKey: ["site", "entry-types", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSiteEntryTypes(String(workspaceId), { page: 1, size: 200 }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const entriesQuery = useQuery({
    queryKey: ["site", "entries", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSiteEntries(String(workspaceId), { page: 1, size: 200 }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const pagesQuery = useQuery({
    queryKey: ["site", "pages", "tree", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSitePagesTree(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const createEntryMutation = useMutation({
    mutationFn: async (values: CreateEntryFormValues) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return createWorkspaceSiteEntry(String(workspaceId), values);
    },
    onSuccess: () => {
      notifySuccessText(t("content_library:TOAST_CREATE_ENTRY_SUCCESS"));
      setCreateOpen(false);
      createForm.resetFields();
      void queryClient.invalidateQueries({ queryKey: ["site", "entries", workspaceId] });
    },
    onError: (error) => notifyError(error),
  });

  const createEntryTypeMutation = useMutation({
    mutationFn: async (values: CreateEntryTypeFormValues) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return createWorkspaceSiteEntryType(String(workspaceId), values);
    },
    onSuccess: () => {
      notifySuccessText(t("content_library:TOAST_CREATE_TYPE_SUCCESS"));
      setCreateTypeOpen(false);
      createTypeForm.resetFields();
      void queryClient.invalidateQueries({ queryKey: ["site", "entry-types", workspaceId] });
    },
    onError: (error) => notifyError(error),
  });

  const publishEntryMutation = useMutation({
    mutationFn: async (row: EntryRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return publishWorkspaceSiteEntry(String(workspaceId), {
        entryTypeCode: row.entryTypeCode,
        slug: row.slug,
      });
    },
    onMutate: (row) => {
      setProcessingEntryId(row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:TOAST_PUBLISH_ENTRY_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["site", "entries", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["site", "entry-types", workspaceId] }),
      ]);
    },
    onError: (error) => notifyError(error),
    onSettled: () => setProcessingEntryId(null),
  });

  const unpublishEntryMutation = useMutation({
    mutationFn: async (row: EntryRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return unpublishWorkspaceSiteEntry(String(workspaceId), {
        entryTypeCode: row.entryTypeCode,
        slug: row.slug,
      });
    },
    onMutate: (row) => {
      setProcessingEntryId(row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:TOAST_UNPUBLISH_ENTRY_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["site", "entries", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["site", "entry-types", workspaceId] }),
      ]);
    },
    onError: (error) => notifyError(error),
    onSettled: () => setProcessingEntryId(null),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (row: EntryRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteWorkspaceSiteEntry(String(workspaceId), row.id);
    },
    onMutate: (row) => {
      setProcessingEntryId(row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:TOAST_DELETE_ENTRY_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["site", "entries", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["site", "entry-types", workspaceId] }),
      ]);
    },
    onError: (error) => notifyError(error),
    onSettled: () => setProcessingEntryId(null),
  });

  const deleteEntryTypeMutation = useMutation({
    mutationFn: async (row: EntryTypeRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteWorkspaceSiteEntryType(String(workspaceId), row.id);
    },
    onMutate: (row) => {
      setProcessingTypeId(row.id);
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:TOAST_DELETE_TYPE_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["site", "entry-types", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["site", "entries", workspaceId] }),
      ]);
    },
    onError: (error) => notifyError(error),
    onSettled: () => setProcessingTypeId(null),
  });

  const entryRows = React.useMemo<EntryRow[]>(() => {
    return (entriesQuery.data?.items ?? []).map((row) =>
      Object.assign({}, row, {
        status: (row.publishedRevision ? "published" : "draft") as EntryStatus,
      }),
    );
  }, [entriesQuery.data?.items]);

  const entryTypeRows = React.useMemo<EntryTypeRow[]>(() => {
    const entryTypeCount = new Map<string, number>();
    for (const row of entryRows) {
      entryTypeCount.set(row.entryTypeCode, (entryTypeCount.get(row.entryTypeCode) ?? 0) + 1);
    }

    return (entryTypesQuery.data?.items ?? []).map((row) =>
      Object.assign({}, row, {
        entryCount: entryTypeCount.get(row.code) ?? 0,
      }),
    );
  }, [entryRows, entryTypesQuery.data?.items]);

  const pageRows = React.useMemo<PageRow[]>(() => {
    return flattenPageTree(pagesQuery.data?.items ?? []);
  }, [pagesQuery.data?.items]);

  const entryTypeOptions = React.useMemo(
    () =>
      entryTypeRows.map((row) => ({
        value: row.code,
        label: row.name,
      })),
    [entryTypeRows],
  );

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredEntries = React.useMemo(() => {
    return entryRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (entryTypeFilter !== "all" && row.entryTypeCode !== entryTypeFilter) return false;
      if (!normalizedSearch) return true;

      return [row.slug, row.entryTypeCode].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [entryRows, entryTypeFilter, normalizedSearch, statusFilter]);

  const filteredTypes = React.useMemo(() => {
    if (!normalizedSearch) return entryTypeRows;
    return entryTypeRows.filter((row) =>
      [row.code, row.name].some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [entryTypeRows, normalizedSearch]);

  const filteredPages = React.useMemo(() => {
    return pageRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return [row.title, row.path].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [normalizedSearch, pageRows, statusFilter]);

  const currentRows =
    activeTab === "entries"
      ? filteredEntries
      : activeTab === "types"
        ? filteredTypes
        : filteredPages;

  const pagedRows = React.useMemo(() => {
    const start = (pageIndex - 1) * pageSize;
    return currentRows.slice(start, start + pageSize);
  }, [currentRows, pageIndex, pageSize]);

  React.useEffect(() => {
    setPageIndex(1);
  }, [activeTab, entryTypeFilter, normalizedSearch, statusFilter]);

  // AlertDialog state for delete confirmation
  const [deleteTarget, setDeleteTarget] = React.useState<
    { type: "entry"; row: EntryRow } | { type: "entryType"; row: EntryTypeRow } | null
  >(null);

  const totalPages = Math.max(1, Math.ceil(currentRows.length / pageSize));

  const firstError = entryTypesQuery.error || entriesQuery.error || pagesQuery.error;
  const loading = entryTypesQuery.isLoading || entriesQuery.isLoading || pagesQuery.isLoading;

  return (
    <>
      <DefaultPage
        title={t("nav:NAV_CONTENT_LIBRARY")}
        description={t("content_library:INDEX_DESC")}
        action={
          activeTab === "entries" ? (
            <Button
              type="primary"
              disabled={!workspaceId || entryTypeRows.length === 0}
              onClick={() => setCreateOpen(true)}
            >
              {t("content_library:ACTION_CREATE_ENTRY")}
            </Button>
          ) : activeTab === "types" ? (
            <Button type="primary" disabled={!workspaceId} onClick={() => setCreateTypeOpen(true)}>
              {t("content_library:ACTION_CREATE_TYPE")}
            </Button>
          ) : null
        }
      >
        <ChromeTabs value={activeTab} onValueChange={(v) => setActiveTab(v as LibraryTab)}>
          <ChromeTabsList>
            <ChromeTabsTrigger value="entries">
              {t("content_library:TAB_ENTRIES")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="types">{t("content_library:TAB_TYPES")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="pages">{t("content_library:TAB_PAGES")}</ChromeTabsTrigger>
          </ChromeTabsList>

          {/* Filters toolbar */}
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("content_library:SEARCH_PLACEHOLDER")}
              allowClear
              className="w-full md:w-80"
            />

            {activeTab === "entries" || activeTab === "pages" ? (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | EntryStatus)}
                className="h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground w-full md:w-52"
              >
                <option value="all">{t("content_library:FILTER_STATUS_ALL")}</option>
                <option value="draft">{t("content_library:FILTER_STATUS_DRAFT")}</option>
                <option value="published">{t("content_library:FILTER_STATUS_PUBLISHED")}</option>
              </select>
            ) : null}

            {activeTab === "entries" ? (
              <>
                <select
                  value={entryTypeFilter}
                  onChange={(e) => setEntryTypeFilter(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground w-full md:w-52"
                >
                  <option value="all">{t("content_library:FILTER_TYPE_ALL")}</option>
                  {entryTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* View toggle button group (replaces Segmented) */}
                <div className="inline-flex rounded-md border border-border">
                  {(["table", "masonry"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setEntriesView(mode)}
                      className={`px-3 py-1 text-sm first:rounded-l-md last:rounded-r-md ${
                        entriesView === mode
                          ? "bg-foreground text-background"
                          : "bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {t(`content_library:VIEW_${mode === "table" ? "TABLE" : "MASONRY"}`)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <PageState
            loading={loading}
            error={firstError}
            onRetry={() => {
              void entryTypesQuery.refetch();
              void entriesQuery.refetch();
              void pagesQuery.refetch();
            }}
            loadingVariant="table"
          >
            {/* Entries tab */}
            <ChromeTabsContent value="entries">
              <EntriesTabContent
                view={entriesView}
                rows={pagedRows as EntryRow[]}
                t={t}
                workspaceId={workspaceId}
                navigate={navigate}
                processingEntryId={processingEntryId}
                onPublish={(row) => void publishEntryMutation.mutateAsync(row)}
                onUnpublish={(row) => void unpublishEntryMutation.mutateAsync(row)}
                onDelete={(row) => setDeleteTarget({ type: "entry", row })}
              />
            </ChromeTabsContent>

            {/* Types tab */}
            <ChromeTabsContent value="types">
              <TypesTabContent
                rows={pagedRows as EntryTypeRow[]}
                t={t}
                processingTypeId={processingTypeId}
                onDelete={(row) => setDeleteTarget({ type: "entryType", row })}
              />
            </ChromeTabsContent>

            {/* Pages tab */}
            <ChromeTabsContent value="pages">
              <PagesTabContent
                rows={pagedRows as PageRow[]}
                t={t}
                workspaceId={workspaceId}
                navigate={navigate}
              />
            </ChromeTabsContent>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <span className="text-sm text-muted-foreground">
                {t("content_library:PAGINATION_TOTAL", { total: currentRows.length })}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPageIndex(1);
                  }}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {[10, 20, 50].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <Button
                  size="small"
                  disabled={pageIndex <= 1}
                  onClick={() => setPageIndex((p) => p - 1)}
                >
                  &lsaquo;
                </Button>
                <span className="text-sm">
                  {pageIndex} / {totalPages}
                </span>
                <Button
                  size="small"
                  disabled={pageIndex >= totalPages}
                  onClick={() => setPageIndex((p) => p + 1)}
                >
                  &rsaquo;
                </Button>
              </div>
            </div>
          </PageState>
        </ChromeTabs>
      </DefaultPage>

      {/* Create entry dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!createEntryMutation.isPending) setCreateOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("content_library:CREATE_ENTRY_DIALOG_TITLE")}</DialogTitle>
          </DialogHeader>
          <Form<CreateEntryFormValues>
            form={createForm}
            layout="vertical"
            initialValues={{ entryTypeCode: entryTypeRows[0]?.code, slug: "" }}
          >
            <Form.Item
              name="entryTypeCode"
              label={t("content_library:CREATE_ENTRY_FIELD_TYPE")}
              rules={[{ required: true }]}
            >
              <Select options={entryTypeOptions} />
            </Form.Item>
            <Form.Item
              name="slug"
              label={t("content_library:CREATE_ENTRY_FIELD_SLUG")}
              rules={[
                { required: true },
                {
                  pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                  message: t("content_library:CREATE_ENTRY_SLUG_HINT"),
                },
              ]}
            >
              <Input placeholder="hello-world" />
            </Form.Item>
          </Form>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} disabled={createEntryMutation.isPending}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              loading={createEntryMutation.isPending}
              onClick={() => {
                void createForm.validateFields().then((values) => {
                  void createEntryMutation.mutateAsync(values);
                });
              }}
            >
              {t("common:CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create entry type dialog */}
      <Dialog
        open={createTypeOpen}
        onOpenChange={(open) => {
          if (!createEntryTypeMutation.isPending) setCreateTypeOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("content_library:CREATE_TYPE_DIALOG_TITLE")}</DialogTitle>
          </DialogHeader>
          <Form<CreateEntryTypeFormValues>
            form={createTypeForm}
            layout="vertical"
            initialValues={{ code: "", name: "" }}
          >
            <Form.Item
              name="code"
              label={t("content_library:CREATE_TYPE_FIELD_CODE")}
              rules={[
                { required: true },
                {
                  pattern: /^[a-z][a-z0-9_]*$/,
                  message: t("content_library:CREATE_TYPE_CODE_HINT"),
                },
              ]}
            >
              <Input placeholder="post" />
            </Form.Item>
            <Form.Item
              name="name"
              label={t("content_library:CREATE_TYPE_FIELD_NAME")}
              rules={[{ required: true }]}
            >
              <Input placeholder="Post" />
            </Form.Item>
          </Form>
          <DialogFooter>
            <Button
              onClick={() => setCreateTypeOpen(false)}
              disabled={createEntryTypeMutation.isPending}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              loading={createEntryTypeMutation.isPending}
              onClick={() => {
                void createTypeForm.validateFields().then((values) => {
                  void createEntryTypeMutation.mutateAsync(values);
                });
              }}
            >
              {t("common:CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation alert dialog */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "entry"
                ? t("content_library:ENTRY_DELETE_CONFIRM_TITLE")
                : deleteTarget?.type === "entryType"
                  ? t("content_library:TYPE_DELETE_CONFIRM_TITLE", {
                      code: (deleteTarget.row as EntryTypeRow).code,
                    })
                  : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("common:ACTION_IRREVERSIBLE", { defaultValue: "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:CANCEL")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "entry") {
                  void deleteEntryMutation.mutateAsync(deleteTarget.row as EntryRow);
                } else {
                  void deleteEntryTypeMutation.mutateAsync(deleteTarget.row as EntryTypeRow);
                }
                setDeleteTarget(null);
              }}
            >
              {t("common:CONFIRM")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components: entries / types / pages tab content                */
/* ------------------------------------------------------------------ */

type EntryActionHandlers = {
  onPublish: (row: EntryRow) => void;
  onUnpublish: (row: EntryRow) => void;
  onDelete: (row: EntryRow) => void;
};

function StatusTag({ status, t }: { status: EntryStatus; t: (k: string) => string }) {
  return (
    <Tag color={status === "published" ? "green" : "gold"}>
      {status === "published"
        ? t("content_library:ENTRY_STATUS_PUBLISHED")
        : t("content_library:ENTRY_STATUS_DRAFT")}
    </Tag>
  );
}

function EntryActionsDropdown({
  row,
  processingEntryId,
  workspaceId,
  navigate,
  t,
  ...handlers
}: {
  row: EntryRow;
  processingEntryId: string | null;
  workspaceId: string | number | null;
  navigate: ReturnType<typeof useNavigate>;
  t: (k: string) => string;
} & EntryActionHandlers) {
  const busy = processingEntryId === row.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="small" disabled={busy}>
          {t("content_library:ENTRY_COL_ACTIONS")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            if (!workspaceId) return;
            void navigate({
              to: "/w/$workspaceId/editor/$editorMode/$entityId",
              params: { workspaceId: String(workspaceId), editorMode: "article", entityId: row.id },
              search: { pathname: `/entry/${row.slug}` },
            });
          }}
        >
          {t("content_library:ENTRY_ACTION_EDIT")}
        </DropdownMenuItem>
        {row.status === "published" ? (
          <DropdownMenuItem onSelect={() => handlers.onUnpublish(row)}>
            {t("content_library:ENTRY_ACTION_UNPUBLISH")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => handlers.onPublish(row)}>
            {t("content_library:ENTRY_ACTION_PUBLISH")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          disabled={row.status === "published"}
          onSelect={() => handlers.onDelete(row)}
        >
          {t("content_library:ENTRY_ACTION_DELETE")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* Entries: table view */
function EntriesTable(
  props: {
    rows: EntryRow[];
    t: (k: string) => string;
    workspaceId: string | number | null;
    navigate: ReturnType<typeof useNavigate>;
    processingEntryId: string | null;
  } & EntryActionHandlers,
) {
  const { rows, t } = props;
  if (!rows.length)
    return (
      <p className="py-8 text-center text-muted-foreground">{t("content_library:EMPTY_ENTRIES")}</p>
    );
  return (
    <UiTable>
      <TableHeader>
        <TableRow>
          <TableHead>{t("content_library:ENTRY_COL_SLUG")}</TableHead>
          <TableHead>{t("content_library:ENTRY_COL_TYPE")}</TableHead>
          <TableHead>{t("content_library:ENTRY_COL_STATUS")}</TableHead>
          <TableHead>{t("content_library:ENTRY_COL_REVISIONS")}</TableHead>
          <TableHead className="text-right">{t("content_library:ENTRY_COL_ACTIONS")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.slug}</TableCell>
            <TableCell>{row.entryTypeCode}</TableCell>
            <TableCell>
              <StatusTag status={row.status} t={t} />
            </TableCell>
            <TableCell>
              {row.draftRevision}/{row.publishedRevision ?? "-"}
            </TableCell>
            <TableCell className="text-right">
              <EntryActionsDropdown row={row} {...props} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </UiTable>
  );
}

/* Entries: masonry / card view */
function EntriesCards(
  props: {
    rows: EntryRow[];
    t: (k: string) => string;
    workspaceId: string | number | null;
    navigate: ReturnType<typeof useNavigate>;
    processingEntryId: string | null;
  } & EntryActionHandlers,
) {
  const { rows, t } = props;
  if (!rows.length)
    return (
      <p className="py-8 text-center text-muted-foreground">{t("content_library:EMPTY_ENTRIES")}</p>
    );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((item) => (
        <div key={item.id} className="rounded-lg border border-border p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-medium truncate">{item.slug}</span>
            <StatusTag status={item.status} t={t} />
          </div>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>{item.entryTypeCode}</span>
            <span>
              {t("content_library:ENTRY_COL_REVISIONS")}: {item.draftRevision}/
              {item.publishedRevision ?? "-"}
            </span>
          </div>
          <div className="mt-auto pt-2">
            <EntryActionsDropdown row={item} {...props} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EntriesTabContent(
  props: {
    view: EntriesView;
    rows: EntryRow[];
    t: (k: string) => string;
    workspaceId: string | number | null;
    navigate: ReturnType<typeof useNavigate>;
    processingEntryId: string | null;
  } & EntryActionHandlers,
) {
  return props.view === "table" ? <EntriesTable {...props} /> : <EntriesCards {...props} />;
}

/* Types tab */
function TypesTabContent({
  rows,
  t,
  processingTypeId,
  onDelete,
}: {
  rows: EntryTypeRow[];
  t: (k: string) => string;
  processingTypeId: string | null;
  onDelete: (row: EntryTypeRow) => void;
}) {
  if (!rows.length)
    return (
      <p className="py-8 text-center text-muted-foreground">{t("content_library:EMPTY_TYPES")}</p>
    );
  return (
    <UiTable>
      <TableHeader>
        <TableRow>
          <TableHead>{t("content_library:TYPE_COL_CODE")}</TableHead>
          <TableHead>{t("content_library:TYPE_COL_NAME")}</TableHead>
          <TableHead>{t("content_library:TYPE_COL_ENTRY_COUNT")}</TableHead>
          <TableHead className="text-right">{t("content_library:ENTRY_COL_ACTIONS")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.code}</TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.entryCount}</TableCell>
            <TableCell className="text-right">
              <Button
                danger
                size="small"
                disabled={row.entryCount > 0 || processingTypeId === row.id}
                onClick={() => onDelete(row)}
              >
                {t("content_library:TYPE_ACTION_DELETE")}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </UiTable>
  );
}

/* Pages tab */
function PagesTabContent({
  rows,
  t,
  workspaceId,
  navigate,
}: {
  rows: PageRow[];
  t: (k: string) => string;
  workspaceId: string | number | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (!rows.length)
    return (
      <p className="py-8 text-center text-muted-foreground">{t("content_library:EMPTY_PAGES")}</p>
    );
  return (
    <UiTable>
      <TableHeader>
        <TableRow>
          <TableHead>{t("content_library:PAGE_COL_TITLE")}</TableHead>
          <TableHead>{t("content_library:PAGE_COL_PATH")}</TableHead>
          <TableHead>{t("content_library:PAGE_COL_STATUS")}</TableHead>
          <TableHead>{t("content_library:PAGE_COL_UPDATED_AT")}</TableHead>
          <TableHead className="text-right">{t("content_library:ENTRY_COL_ACTIONS")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.title}</TableCell>
            <TableCell>{row.path}</TableCell>
            <TableCell>
              <StatusTag status={row.status} t={t} />
            </TableCell>
            <TableCell>{row.updatedAt ?? "-"}</TableCell>
            <TableCell className="text-right">
              <Button
                size="small"
                onClick={() => {
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
                }}
              >
                {t("content_library:ENTRY_ACTION_EDIT")}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </UiTable>
  );
}
