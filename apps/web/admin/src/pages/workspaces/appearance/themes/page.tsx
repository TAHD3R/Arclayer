import * as React from "react";
import { Alert, Button, Card, Input, Pagination, Select, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";

type ThemePackageStatus = "active" | "installed";

type ThemePackageRow = {
  id: string;
  name: string;
  themeId: string;
  version: string;
  status: ThemePackageStatus;
  capabilities: string[];
  updatedAt: string;
};

const THEME_ROWS: ThemePackageRow[] = [
  {
    id: "theme-default",
    name: "Celestial Default",
    themeId: "@celestial/default",
    version: "1.4.2",
    status: "active",
    capabilities: ["tokens", "presets", "configSchema"],
    updatedAt: "2026-02-10 18:00",
  },
  {
    id: "theme-editorial",
    name: "Editorial Pro",
    themeId: "@celestial/editorial",
    version: "0.9.1",
    status: "installed",
    capabilities: ["tokens", "configSchema"],
    updatedAt: "2026-02-12 07:45",
  },
  {
    id: "theme-landing-kit",
    name: "Landing Kit",
    themeId: "@celestial/landing-kit",
    version: "2.1.0",
    status: "installed",
    capabilities: ["tokens", "presets"],
    updatedAt: "2026-02-09 12:30",
  },
];

export function WorkspaceThemesView() {
  const { t } = useTranslation(["appearance", "nav", "common"]);

  const [searchText, setSearchText] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | ThemePackageStatus>("all");
  const [pageIndex, setPageIndex] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const filteredRows = React.useMemo(() => {
    const normalized = searchText.trim().toLowerCase();

    return THEME_ROWS.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!normalized) return true;
      return [row.name, row.themeId, row.version].some((value) =>
        value.toLowerCase().includes(normalized),
      );
    });
  }, [searchText, statusFilter]);

  const pagedRows = React.useMemo(() => {
    const start = (pageIndex - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, pageIndex, pageSize]);

  const columns = React.useMemo<TableColumnsType<ThemePackageRow>>(
    () => [
      {
        title: t("appearance:THEME_CENTER_COL_NAME"),
        dataIndex: "name",
        key: "name",
      },
      {
        title: t("appearance:THEME_CENTER_COL_THEME_ID"),
        dataIndex: "themeId",
        key: "themeId",
      },
      {
        title: t("appearance:THEME_CENTER_COL_VERSION"),
        dataIndex: "version",
        key: "version",
      },
      {
        title: t("appearance:THEME_CENTER_COL_STATUS"),
        dataIndex: "status",
        key: "status",
        render: (status: ThemePackageStatus) => (
          <Tag color={status === "active" ? "green" : "blue"}>
            {status === "active"
              ? t("appearance:THEME_CENTER_STATUS_ACTIVE")
              : t("appearance:THEME_CENTER_STATUS_INSTALLED")}
          </Tag>
        ),
      },
      {
        title: t("appearance:THEME_CENTER_COL_CAPABILITIES"),
        dataIndex: "capabilities",
        key: "capabilities",
        render: (capabilities: string[]) => (
          <div className="flex flex-wrap gap-1">
            {capabilities.map((capability) => (
              <Tag key={capability}>{capability}</Tag>
            ))}
          </div>
        ),
      },
      {
        title: t("appearance:THEME_CENTER_COL_UPDATED_AT"),
        dataIndex: "updatedAt",
        key: "updatedAt",
      },
      {
        title: t("appearance:THEME_CENTER_COL_ACTIONS"),
        key: "actions",
        align: "right",
        render: (_, row) => (
          <Space>
            <Button size="small">{t("appearance:THEME_CENTER_ACTION_CONFIGURE")}</Button>
            <Button
              size="small"
              type={row.status === "active" ? "default" : "primary"}
              disabled={row.status === "active"}
            >
              {t("appearance:THEME_CENTER_ACTION_ACTIVATE")}
            </Button>
          </Space>
        ),
      },
    ],
    [t],
  );

  return (
    <DefaultPage
      title={t("nav:NAV_APPEARANCE_THEMES")}
      description={t("appearance:THEME_CENTER_DESC")}
      action={<Button type="primary">{t("appearance:THEME_CENTER_ACTION_IMPORT")}</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setPageIndex(1);
            }}
            placeholder={t("appearance:THEME_CENTER_SEARCH_PLACEHOLDER")}
            allowClear
            className="w-full md:w-80"
          />

          <Select
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPageIndex(1);
            }}
            options={[
              { value: "all", label: t("appearance:THEME_CENTER_FILTER_ALL") },
              { value: "active", label: t("appearance:THEME_CENTER_FILTER_ACTIVE") },
              { value: "installed", label: t("appearance:THEME_CENTER_FILTER_INSTALLED") },
            ]}
            className="w-full md:w-52"
          />
        </div>

        <Table<ThemePackageRow>
          rowKey="id"
          columns={columns}
          dataSource={pagedRows}
          pagination={false}
          locale={{ emptyText: t("appearance:THEME_CENTER_EMPTY") }}
          scroll={{ x: 1160 }}
        />

        <div className="flex justify-end">
          <Pagination
            current={pageIndex}
            pageSize={pageSize}
            showSizeChanger
            pageSizeOptions={[10, 20, 50]}
            total={filteredRows.length}
            onChange={(nextPage, nextPageSize) => {
              setPageIndex(nextPage);
              setPageSize(nextPageSize);
            }}
            showTotal={(total) => t("appearance:THEME_CENTER_PAGINATION_TOTAL", { total })}
          />
        </div>

        <Card title={t("appearance:THEME_CENTER_CONFIG_SCHEMA_TITLE")}>
          <Space direction="vertical" size={8} className="w-full">
            <Typography.Paragraph className="!mb-0 text-sm text-muted-foreground">
              {t("appearance:THEME_CENTER_CONFIG_SCHEMA_DESC")}
            </Typography.Paragraph>
            <Alert
              type="info"
              showIcon
              message={t("appearance:THEME_CENTER_CONFIG_SCHEMA_ALERT")}
            />
          </Space>
        </Card>
      </div>
    </DefaultPage>
  );
}
