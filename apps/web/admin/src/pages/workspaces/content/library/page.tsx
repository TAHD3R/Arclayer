import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Modal,
  Pagination,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
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
import { DefaultPage } from "@/components/common/default-page";
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
        status: row.publishedRevision ? "published" : "draft",
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

  const entryColumns = React.useMemo<TableColumnsType<EntryRow>>(
    () => [
      {
        title: t("content_library:ENTRY_COL_SLUG"),
        dataIndex: "slug",
        key: "slug",
      },
      {
        title: t("content_library:ENTRY_COL_TYPE"),
        dataIndex: "entryTypeCode",
        key: "entryTypeCode",
      },
      {
        title: t("content_library:ENTRY_COL_STATUS"),
        dataIndex: "status",
        key: "status",
        render: (status: EntryStatus) => (
          <Tag color={status === "published" ? "green" : "gold"}>
            {status === "published"
              ? t("content_library:ENTRY_STATUS_PUBLISHED")
              : t("content_library:ENTRY_STATUS_DRAFT")}
          </Tag>
        ),
      },
      {
        title: t("content_library:ENTRY_COL_REVISIONS"),
        key: "revisions",
        render: (_, row) => `${row.draftRevision}/${row.publishedRevision ?? "-"}`,
      },
      {
        title: t("content_library:ENTRY_COL_ACTIONS"),
        key: "actions",
        align: "right",
        render: (_, row) => (
          <Space wrap className="justify-end">
            <Button
              onClick={() => {
                if (!workspaceId) return;
                void navigate({
                  to: "/w/$workspaceId/editor/$editorMode/$entityId",
                  params: {
                    workspaceId: String(workspaceId),
                    editorMode: "article",
                    entityId: row.id,
                  },
                  search: { pathname: `/entry/${row.slug}` },
                });
              }}
              disabled={processingEntryId === row.id}
            >
              {t("content_library:ENTRY_ACTION_EDIT")}
            </Button>

            {row.status === "published" ? (
              <Button
                onClick={() => {
                  void unpublishEntryMutation.mutateAsync(row);
                }}
                disabled={processingEntryId === row.id}
              >
                {t("content_library:ENTRY_ACTION_UNPUBLISH")}
              </Button>
            ) : (
              <Button
                type="primary"
                ghost
                onClick={() => {
                  void publishEntryMutation.mutateAsync(row);
                }}
                disabled={processingEntryId === row.id}
              >
                {t("content_library:ENTRY_ACTION_PUBLISH")}
              </Button>
            )}

            <Popconfirm
              title={t("content_library:ENTRY_DELETE_CONFIRM_TITLE")}
              onConfirm={() => {
                void deleteEntryMutation.mutateAsync(row);
              }}
              okText={t("common:CONFIRM")}
              cancelText={t("common:CANCEL")}
              disabled={row.status === "published" || processingEntryId === row.id}
            >
              <Button danger disabled={row.status === "published" || processingEntryId === row.id}>
                {t("content_library:ENTRY_ACTION_DELETE")}
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [
      deleteEntryMutation,
      navigate,
      processingEntryId,
      publishEntryMutation,
      t,
      unpublishEntryMutation,
      workspaceId,
    ],
  );

  const typeColumns = React.useMemo<TableColumnsType<EntryTypeRow>>(
    () => [
      {
        title: t("content_library:TYPE_COL_CODE"),
        dataIndex: "code",
        key: "code",
      },
      {
        title: t("content_library:TYPE_COL_NAME"),
        dataIndex: "name",
        key: "name",
      },
      {
        title: t("content_library:TYPE_COL_ENTRY_COUNT"),
        dataIndex: "entryCount",
        key: "entryCount",
      },
      {
        title: t("content_library:ENTRY_COL_ACTIONS"),
        key: "actions",
        align: "right",
        render: (_, row) => (
          <Popconfirm
            title={t("content_library:TYPE_DELETE_CONFIRM_TITLE", { code: row.code })}
            onConfirm={() => {
              void deleteEntryTypeMutation.mutateAsync(row);
            }}
            okText={t("common:CONFIRM")}
            cancelText={t("common:CANCEL")}
            disabled={row.entryCount > 0 || processingTypeId === row.id}
          >
            <Button danger disabled={row.entryCount > 0 || processingTypeId === row.id}>
              {t("content_library:TYPE_ACTION_DELETE")}
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [deleteEntryTypeMutation, processingTypeId, t],
  );

  const pageColumns = React.useMemo<TableColumnsType<PageRow>>(
    () => [
      {
        title: t("content_library:PAGE_COL_TITLE"),
        dataIndex: "title",
        key: "title",
      },
      {
        title: t("content_library:PAGE_COL_PATH"),
        dataIndex: "path",
        key: "path",
      },
      {
        title: t("content_library:PAGE_COL_STATUS"),
        dataIndex: "status",
        key: "status",
        render: (status: EntryStatus) => (
          <Tag color={status === "published" ? "green" : "gold"}>
            {status === "published"
              ? t("content_library:ENTRY_STATUS_PUBLISHED")
              : t("content_library:ENTRY_STATUS_DRAFT")}
          </Tag>
        ),
      },
      {
        title: t("content_library:PAGE_COL_UPDATED_AT"),
        dataIndex: "updatedAt",
        key: "updatedAt",
        render: (updatedAt: string | null) => updatedAt ?? "-",
      },
      {
        title: t("content_library:ENTRY_COL_ACTIONS"),
        key: "actions",
        align: "right",
        render: (_, row) => (
          <Button
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
        ),
      },
    ],
    [navigate, t, workspaceId],
  );

  const renderEntriesView = () => {
    if (entriesView === "table") {
      return (
        <Table<EntryRow>
          rowKey="id"
          columns={entryColumns}
          dataSource={pagedRows as EntryRow[]}
          pagination={false}
          locale={{ emptyText: t("content_library:EMPTY_ENTRIES") }}
          scroll={{ x: 980 }}
        />
      );
    }

    return (
      <List
        grid={{ gutter: 16, xs: 1, md: 2, xl: 3 }}
        dataSource={pagedRows as EntryRow[]}
        locale={{ emptyText: t("content_library:EMPTY_ENTRIES") }}
        renderItem={(item) => (
          <List.Item>
            <Card
              title={item.slug}
              extra={
                <Tag color={item.status === "published" ? "green" : "gold"}>
                  {item.status === "published"
                    ? t("content_library:ENTRY_STATUS_PUBLISHED")
                    : t("content_library:ENTRY_STATUS_DRAFT")}
                </Tag>
              }
              actions={[
                <Button
                  key="edit"
                  type="link"
                  onClick={() => {
                    if (!workspaceId) return;
                    void navigate({
                      to: "/w/$workspaceId/editor/$editorMode/$entityId",
                      params: {
                        workspaceId: String(workspaceId),
                        editorMode: "article",
                        entityId: item.id,
                      },
                      search: { pathname: `/entry/${item.slug}` },
                    });
                  }}
                  disabled={processingEntryId === item.id}
                >
                  {t("content_library:ENTRY_ACTION_EDIT")}
                </Button>,
                item.status === "published" ? (
                  <Button
                    key="unpublish"
                    type="link"
                    onClick={() => {
                      void unpublishEntryMutation.mutateAsync(item);
                    }}
                    disabled={processingEntryId === item.id}
                  >
                    {t("content_library:ENTRY_ACTION_UNPUBLISH")}
                  </Button>
                ) : (
                  <Button
                    key="publish"
                    type="link"
                    onClick={() => {
                      void publishEntryMutation.mutateAsync(item);
                    }}
                    disabled={processingEntryId === item.id}
                  >
                    {t("content_library:ENTRY_ACTION_PUBLISH")}
                  </Button>
                ),
                <Popconfirm
                  key="delete"
                  title={t("content_library:ENTRY_DELETE_CONFIRM_TITLE")}
                  onConfirm={() => {
                    void deleteEntryMutation.mutateAsync(item);
                  }}
                  okText={t("common:CONFIRM")}
                  cancelText={t("common:CANCEL")}
                  disabled={item.status === "published" || processingEntryId === item.id}
                >
                  <Button
                    type="link"
                    danger
                    disabled={item.status === "published" || processingEntryId === item.id}
                  >
                    {t("content_library:ENTRY_ACTION_DELETE")}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <div>{item.entryTypeCode}</div>
                <div>{`${t("content_library:ENTRY_COL_REVISIONS")}: ${item.draftRevision}/${item.publishedRevision ?? "-"}`}</div>
              </div>
            </Card>
          </List.Item>
        )}
      />
    );
  };

  const renderCurrentTab = () => {
    if (activeTab === "entries") {
      return renderEntriesView();
    }

    if (activeTab === "types") {
      return (
        <Table<EntryTypeRow>
          rowKey="id"
          columns={typeColumns}
          dataSource={pagedRows as EntryTypeRow[]}
          pagination={false}
          locale={{ emptyText: t("content_library:EMPTY_TYPES") }}
        />
      );
    }

    return (
      <Table<PageRow>
        rowKey="id"
        columns={pageColumns}
        dataSource={pagedRows as PageRow[]}
        pagination={false}
        locale={{ emptyText: t("content_library:EMPTY_PAGES") }}
        scroll={{ x: 980 }}
      />
    );
  };

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
        <div className="flex flex-col gap-4">
          <Tabs
            activeKey={activeTab}
            onChange={(value) => setActiveTab(value as LibraryTab)}
            items={[
              { key: "entries", label: t("content_library:TAB_ENTRIES") },
              { key: "types", label: t("content_library:TAB_TYPES") },
              { key: "pages", label: t("content_library:TAB_PAGES") },
            ]}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("content_library:SEARCH_PLACEHOLDER")}
              allowClear
              className="w-full md:w-80"
            />

            {activeTab === "entries" || activeTab === "pages" ? (
              <Select
                value={statusFilter}
                onChange={(value) => setStatusFilter(value)}
                options={[
                  { value: "all", label: t("content_library:FILTER_STATUS_ALL") },
                  { value: "draft", label: t("content_library:FILTER_STATUS_DRAFT") },
                  { value: "published", label: t("content_library:FILTER_STATUS_PUBLISHED") },
                ]}
                className="w-full md:w-52"
              />
            ) : null}

            {activeTab === "entries" ? (
              <>
                <Select
                  value={entryTypeFilter}
                  onChange={(value) => setEntryTypeFilter(value)}
                  options={[
                    { value: "all", label: t("content_library:FILTER_TYPE_ALL") },
                    ...entryTypeOptions,
                  ]}
                  className="w-full md:w-52"
                />

                <Segmented
                  value={entriesView}
                  onChange={(value) => setEntriesView(value as EntriesView)}
                  options={[
                    { value: "table", label: t("content_library:VIEW_TABLE") },
                    { value: "masonry", label: t("content_library:VIEW_MASONRY") },
                  ]}
                />
              </>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Spin />
            </div>
          ) : firstError ? (
            <Alert
              type="error"
              showIcon
              message={t("common:REQUEST_FAILED")}
              description={String(firstError)}
            />
          ) : (
            <>
              {renderCurrentTab()}

              <div className="flex justify-end">
                <Pagination
                  current={pageIndex}
                  pageSize={pageSize}
                  showSizeChanger
                  pageSizeOptions={[10, 20, 50]}
                  total={currentRows.length}
                  onChange={(nextPage, nextPageSize) => {
                    setPageIndex(nextPage);
                    setPageSize(nextPageSize);
                  }}
                  showTotal={(total) => t("content_library:PAGINATION_TOTAL", { total })}
                />
              </div>
            </>
          )}
        </div>
      </DefaultPage>

      <Modal
        open={createOpen}
        title={t("content_library:CREATE_ENTRY_DIALOG_TITLE")}
        okText={t("common:CONFIRM")}
        cancelText={t("common:CANCEL")}
        confirmLoading={createEntryMutation.isPending}
        onCancel={() => {
          if (createEntryMutation.isPending) return;
          setCreateOpen(false);
        }}
        onOk={() => {
          void createForm.validateFields().then((values) => {
            void createEntryMutation.mutateAsync(values);
          });
        }}
      >
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
      </Modal>

      <Modal
        open={createTypeOpen}
        title={t("content_library:CREATE_TYPE_DIALOG_TITLE")}
        okText={t("common:CONFIRM")}
        cancelText={t("common:CANCEL")}
        confirmLoading={createEntryTypeMutation.isPending}
        onCancel={() => {
          if (createEntryTypeMutation.isPending) return;
          setCreateTypeOpen(false);
        }}
        onOk={() => {
          void createTypeForm.validateFields().then((values) => {
            void createEntryTypeMutation.mutateAsync(values);
          });
        }}
      >
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
      </Modal>
    </>
  );
}
