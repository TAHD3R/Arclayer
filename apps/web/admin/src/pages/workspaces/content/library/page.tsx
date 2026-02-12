import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Card, Input, List, Pagination, Select, Segmented, Table, Tabs, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type EntryStatus = "draft" | "published";
type EntryRow = {
  id: string;
  title: string;
  slug: string;
  category: string;
  tags: string[];
  status: EntryStatus;
  updatedAt: string;
};

type CategoryRow = {
  id: string;
  name: string;
  entryCount: number;
};

type TagRow = {
  id: string;
  name: string;
  entryCount: number;
};

const ENTRY_ROWS: EntryRow[] = [
  {
    id: "entry-getting-started",
    title: "Getting started with CelestialCMS",
    slug: "getting-started",
    category: "Guides",
    tags: ["cms", "guide"],
    status: "published",
    updatedAt: "2026-02-11 10:30",
  },
  {
    id: "entry-theme-customization",
    title: "Theme customization checklist",
    slug: "theme-customization-checklist",
    category: "Design",
    tags: ["themes", "design"],
    status: "draft",
    updatedAt: "2026-02-12 08:45",
  },
  {
    id: "entry-content-governance",
    title: "Content governance baseline",
    slug: "content-governance-baseline",
    category: "Governance",
    tags: ["policy", "workflow"],
    status: "published",
    updatedAt: "2026-02-09 14:02",
  },
  {
    id: "entry-seo-playbook",
    title: "SEO playbook for landing pages",
    slug: "seo-playbook-landing-pages",
    category: "Marketing",
    tags: ["seo", "landing"],
    status: "draft",
    updatedAt: "2026-02-12 11:10",
  },
];

const CATEGORY_ROWS: CategoryRow[] = [
  { id: "category-guides", name: "Guides", entryCount: 18 },
  { id: "category-design", name: "Design", entryCount: 9 },
  { id: "category-governance", name: "Governance", entryCount: 5 },
  { id: "category-marketing", name: "Marketing", entryCount: 12 },
];

const TAG_ROWS: TagRow[] = [
  { id: "tag-cms", name: "cms", entryCount: 11 },
  { id: "tag-guide", name: "guide", entryCount: 8 },
  { id: "tag-themes", name: "themes", entryCount: 6 },
  { id: "tag-seo", name: "seo", entryCount: 9 },
];

type LibraryTab = "entries" | "categories" | "tags";
type EntriesView = "masonry" | "table";

export function ContentLibraryView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = React.useState<LibraryTab>("entries");
  const [entriesView, setEntriesView] = React.useState<EntriesView>("masonry");

  const [searchText, setSearchText] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | EntryStatus>("all");
  const [categoryFilter, setCategoryFilter] = React.useState<"all" | string>("all");
  const [pageIndex, setPageIndex] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(8);

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredEntries = React.useMemo(() => {
    return ENTRY_ROWS.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (!normalizedSearch) return true;

      return [row.title, row.slug, row.category, ...row.tags].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [categoryFilter, normalizedSearch, statusFilter]);

  const filteredCategories = React.useMemo(() => {
    if (!normalizedSearch) return CATEGORY_ROWS;
    return CATEGORY_ROWS.filter((row) => row.name.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch]);

  const filteredTags = React.useMemo(() => {
    if (!normalizedSearch) return TAG_ROWS;
    return TAG_ROWS.filter((row) => row.name.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch]);

  const currentRows =
    activeTab === "entries"
      ? filteredEntries
      : activeTab === "categories"
        ? filteredCategories
        : filteredTags;

  const pagedRows = React.useMemo(() => {
    const start = (pageIndex - 1) * pageSize;
    return currentRows.slice(start, start + pageSize);
  }, [currentRows, pageIndex, pageSize]);

  React.useEffect(() => {
    setPageIndex(1);
  }, [activeTab, categoryFilter, normalizedSearch, statusFilter]);

  const entryTableColumns = React.useMemo<TableColumnsType<EntryRow>>(
    () => [
      {
        title: t("content_library:ENTRY_COL_TITLE"),
        dataIndex: "title",
        key: "title",
      },
      {
        title: t("content_library:ENTRY_COL_SLUG"),
        dataIndex: "slug",
        key: "slug",
      },
      {
        title: t("content_library:ENTRY_COL_CATEGORY"),
        dataIndex: "category",
        key: "category",
      },
      {
        title: t("content_library:ENTRY_COL_TAGS"),
        dataIndex: "tags",
        key: "tags",
        render: (tags: string[]) => (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ),
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
        title: t("content_library:ENTRY_COL_UPDATED_AT"),
        dataIndex: "updatedAt",
        key: "updatedAt",
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
                  editorMode: "article",
                  entityId: row.id,
                },
                search: { pathname: `/blog/${row.slug}` },
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

  const categoryColumns = React.useMemo<TableColumnsType<CategoryRow>>(
    () => [
      {
        title: t("content_library:CATEGORY_COL_NAME"),
        dataIndex: "name",
        key: "name",
      },
      {
        title: t("content_library:CATEGORY_COL_ENTRY_COUNT"),
        dataIndex: "entryCount",
        key: "entryCount",
      },
    ],
    [t],
  );

  const tagColumns = React.useMemo<TableColumnsType<TagRow>>(
    () => [
      {
        title: t("content_library:TAG_COL_NAME"),
        dataIndex: "name",
        key: "name",
      },
      {
        title: t("content_library:TAG_COL_ENTRY_COUNT"),
        dataIndex: "entryCount",
        key: "entryCount",
      },
    ],
    [t],
  );

  const renderEntriesView = () => {
    if (entriesView === "table") {
      return (
        <Table<EntryRow>
          rowKey="id"
          columns={entryTableColumns}
          dataSource={pagedRows as EntryRow[]}
          pagination={false}
          locale={{ emptyText: t("content_library:EMPTY_ENTRIES") }}
          scroll={{ x: 1100 }}
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
              title={item.title}
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
                      search: { pathname: `/blog/${item.slug}` },
                    });
                  }}
                >
                  {t("content_library:ENTRY_ACTION_EDIT")}
                </Button>,
              ]}
            >
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <div>{`/${item.slug}`}</div>
                <div>{item.category}</div>
                <div>{item.updatedAt}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
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

    if (activeTab === "categories") {
      return (
        <Table<CategoryRow>
          rowKey="id"
          columns={categoryColumns}
          dataSource={pagedRows as CategoryRow[]}
          pagination={false}
          locale={{ emptyText: t("content_library:EMPTY_CATEGORIES") }}
        />
      );
    }

    return (
      <Table<TagRow>
        rowKey="id"
        columns={tagColumns}
        dataSource={pagedRows as TagRow[]}
        pagination={false}
        locale={{ emptyText: t("content_library:EMPTY_TAGS") }}
      />
    );
  };

  return (
    <DefaultPage
      title={t("nav:NAV_CONTENT_LIBRARY")}
      description={t("content_library:INDEX_DESC")}
      action={<Button type="primary">{t("content_library:ACTION_CREATE_ENTRY")}</Button>}
    >
      <div className="flex flex-col gap-4">
        <Tabs
          activeKey={activeTab}
          onChange={(value) => setActiveTab(value as LibraryTab)}
          items={[
            { key: "entries", label: t("content_library:TAB_ENTRIES") },
            { key: "categories", label: t("content_library:TAB_CATEGORIES") },
            { key: "tags", label: t("content_library:TAB_TAGS") },
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

          {activeTab === "entries" ? (
            <>
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

              <Select
                value={categoryFilter}
                onChange={(value) => setCategoryFilter(value)}
                options={[
                  { value: "all", label: t("content_library:FILTER_CATEGORY_ALL") },
                  ...CATEGORY_ROWS.map((category) => ({
                    value: category.name,
                    label: category.name,
                  })),
                ]}
                className="w-full md:w-52"
              />

              <Segmented
                value={entriesView}
                onChange={(value) => setEntriesView(value as EntriesView)}
                options={[
                  { value: "masonry", label: t("content_library:VIEW_MASONRY") },
                  { value: "table", label: t("content_library:VIEW_TABLE") },
                ]}
              />
            </>
          ) : null}
        </div>

        {renderCurrentTab()}

        <div className="flex justify-end">
          <Pagination
            current={pageIndex}
            pageSize={pageSize}
            showSizeChanger
            pageSizeOptions={[8, 16, 32]}
            total={currentRows.length}
            onChange={(nextPage, nextPageSize) => {
              setPageIndex(nextPage);
              setPageSize(nextPageSize);
            }}
            showTotal={(total) => t("content_library:PAGINATION_TOTAL", { total })}
          />
        </div>
      </div>
    </DefaultPage>
  );
}
