import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Pagination, Select, Space, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { useTranslation } from "react-i18next";

import { listWorkspaceSitePagesTree, type SitePageTreeNode } from "@/api/workspace-site";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type PageType = "static" | "template";
type PageStatus = "draft" | "published";

type PageTableRow = {
  id: string;
  path: string;
  level: number;
  pageType: PageType;
  status: PageStatus;
  draftRevision: number;
  publishedRevision: number | null;
  visibility: "public" | "private";
};

function flattenTree(
  nodes: SitePageTreeNode[],
  level = 0,
): Array<{ node: SitePageTreeNode; level: number }> {
  const out: Array<{ node: SitePageTreeNode; level: number }> = [];
  for (const node of nodes) {
    out.push({ node, level });
    const children = Array.isArray(node.children) ? node.children : [];
    out.push(...flattenTree(children, level + 1));
  }
  return out;
}

function detectPageType(path: string): PageType {
  return path.includes(":") ? "template" : "static";
}

function detectPageStatus(row: SitePageTreeNode): PageStatus {
  if (row.publishedRevision === null || row.publishedRevision === undefined) return "draft";
  return row.draftRevision === row.publishedRevision ? "published" : "draft";
}

export function ContentPagesIndexView() {
  const { t } = useTranslation(["content_pages", "nav", "common"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const navigate = useNavigate();

  const pagesQuery = useQuery({
    queryKey: ["site", "pages", "tree", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listWorkspaceSitePagesTree(String(workspaceId));
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const [searchText, setSearchText] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"all" | PageType>("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | PageStatus>("all");
  const [visibilityFilter, setVisibilityFilter] = React.useState<"all" | "public" | "private">("all");
  const [pageIndex, setPageIndex] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const allRows = React.useMemo<PageTableRow[]>(() => {
    const tree = pagesQuery.data?.items ?? [];
    return flattenTree(tree).map(({ node, level }) => ({
      id: node.id,
      path: node.path,
      level,
      pageType: detectPageType(node.path),
      status: detectPageStatus(node),
      draftRevision: node.draftRevision,
      publishedRevision: node.publishedRevision ?? null,
      visibility: node.visibility,
    }));
  }, [pagesQuery.data?.items]);

  const filteredRows = React.useMemo(() => {
    const normalized = searchText.trim().toLowerCase();

    return allRows.filter((row) => {
      if (typeFilter !== "all" && row.pageType !== typeFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (visibilityFilter !== "all" && row.visibility !== visibilityFilter) return false;
      if (!normalized) return true;

      return row.path.toLowerCase().includes(normalized);
    });
  }, [allRows, searchText, statusFilter, typeFilter, visibilityFilter]);

  const pagedRows = React.useMemo(() => {
    const start = (pageIndex - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageIndex, pageSize]);

  const columns = React.useMemo<TableColumnsType<PageTableRow>>(
    () => [
      {
        title: t("content_pages:COL_PATH"),
        dataIndex: "path",
        key: "path",
        render: (value: string, row) => {
          const prefix = row.level > 0 ? `${"· ".repeat(Math.min(row.level, 4))}` : "";
          return <span className="font-mono">{`${prefix}${value}`}</span>;
        },
      },
      {
        title: t("content_pages:INDEX_COL_TYPE"),
        dataIndex: "pageType",
        key: "pageType",
        render: (value: PageType) => (
          <Tag color={value === "template" ? "purple" : "blue"}>
            {value === "template"
              ? t("content_pages:INDEX_TYPE_TEMPLATE")
              : t("content_pages:INDEX_TYPE_STATIC")}
          </Tag>
        ),
      },
      {
        title: t("content_pages:COL_VISIBILITY"),
        dataIndex: "visibility",
        key: "visibility",
        render: (value: "public" | "private") => (
          <Tag color={value === "public" ? "green" : "volcano"}>{value}</Tag>
        ),
      },
      {
        title: t("content_pages:INDEX_COL_STATUS"),
        dataIndex: "status",
        key: "status",
        render: (value: PageStatus) => (
          <Tag color={value === "published" ? "green" : "gold"}>
            {value === "published"
              ? t("content_pages:INDEX_STATUS_PUBLISHED")
              : t("content_pages:INDEX_STATUS_DRAFT")}
          </Tag>
        ),
      },
      {
        title: t("content_pages:COL_DRAFT"),
        dataIndex: "draftRevision",
        key: "draftRevision",
      },
      {
        title: t("content_pages:COL_PUBLISHED"),
        dataIndex: "publishedRevision",
        key: "publishedRevision",
        render: (value: number | null) =>
          value === null ? t("content_pages:PLACEHOLDER_DASH") : value,
      },
      {
        title: t("content_pages:COL_ACTIONS"),
        key: "actions",
        align: "right",
        render: (_, row) => (
          <Button
            type="default"
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
            {t("content_pages:INDEX_ACTION_OPEN_EDITOR")}
          </Button>
        ),
      },
    ],
    [navigate, t, workspaceId],
  );

  const onChangePage = (nextPage: number, nextSize: number) => {
    setPageIndex(nextPage);
    setPageSize(nextSize);
  };

  const onChangeFilter = (updater: () => void) => {
    updater();
    setPageIndex(1);
  };

  return (
    <DefaultPage
      title={t("nav:NAV_CONTENT_PAGES")}
      description={t("content_pages:INDEX_DESC")}
      action={
        <Space>
          <Button type="default">{t("content_pages:INDEX_ACTION_CREATE_TEMPLATE")}</Button>
          <Button type="primary">{t("content_pages:INDEX_ACTION_CREATE_STATIC")}</Button>
        </Space>
      }
    >
      <PageState
        loading={pagesQuery.isLoading}
        error={pagesQuery.error}
        empty={!pagesQuery.isLoading && !pagesQuery.error && filteredRows.length === 0}
        onRetry={() => pagesQuery.refetch()}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={searchText}
              onChange={(event) => onChangeFilter(() => setSearchText(event.target.value))}
              placeholder={t("content_pages:INDEX_SEARCH_PLACEHOLDER")}
              allowClear
              className="w-full md:w-80"
            />

            <Select
              value={typeFilter}
              onChange={(value) => onChangeFilter(() => setTypeFilter(value))}
              options={[
                { value: "all", label: t("content_pages:INDEX_FILTER_TYPE_ALL") },
                { value: "static", label: t("content_pages:INDEX_FILTER_TYPE_STATIC") },
                { value: "template", label: t("content_pages:INDEX_FILTER_TYPE_TEMPLATE") },
              ]}
              className="w-full md:w-52"
            />

            <Select
              value={statusFilter}
              onChange={(value) => onChangeFilter(() => setStatusFilter(value))}
              options={[
                { value: "all", label: t("content_pages:INDEX_FILTER_STATUS_ALL") },
                { value: "draft", label: t("content_pages:INDEX_FILTER_STATUS_DRAFT") },
                { value: "published", label: t("content_pages:INDEX_FILTER_STATUS_PUBLISHED") },
              ]}
              className="w-full md:w-52"
            />

            <Select
              value={visibilityFilter}
              onChange={(value) => onChangeFilter(() => setVisibilityFilter(value))}
              options={[
                { value: "all", label: t("content_pages:INDEX_FILTER_VISIBILITY_ALL") },
                { value: "public", label: t("content_pages:INDEX_FILTER_VISIBILITY_PUBLIC") },
                { value: "private", label: t("content_pages:INDEX_FILTER_VISIBILITY_PRIVATE") },
              ]}
              className="w-full md:w-52"
            />
          </div>

          <Table<PageTableRow>
            rowKey="id"
            columns={columns}
            dataSource={pagedRows}
            pagination={false}
            locale={{ emptyText: t("content_pages:INDEX_EMPTY") }}
            scroll={{ x: 980 }}
          />

          <div className="flex justify-end">
            <Pagination
              current={pageIndex}
              pageSize={pageSize}
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              total={filteredRows.length}
              onChange={onChangePage}
              showTotal={(total) => t("content_pages:INDEX_PAGINATION_TOTAL", { total })}
            />
          </div>
        </div>
      </PageState>
    </DefaultPage>
  );
}
