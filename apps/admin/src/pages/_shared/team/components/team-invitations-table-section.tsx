import { Input, Pagination } from "antd";
import { type Table } from "@tanstack/react-table";
import { Search } from "lucide-react";

import { ContentGuard } from "@/components/common/content-guard";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import {
  DataTablePresenter,
  DataTableToolbarTools,
  useDataTableDensityPreference,
} from "@celestial/ui/data-table";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface PageDataLike {
  page: number;
  size: number;
  total: number;
}

interface DataTableLike<TRow> {
  isLoading: boolean;
  isFetching: boolean;
  items: TRow[];
  error: unknown;
  refetch: () => Promise<unknown> | void;
  resetColumnVisibility?: () => void;
  table: Table<TRow>;
  pageData?: PageDataLike | null;
  searchInput: string;
  setSearchInput: (value: string) => void;
}

interface TeamInvitationsTableSectionProps<TRow> {
  tableHook: DataTableLike<TRow>;
  tableId: string;
  placeholder: string;
  emptyTitle: string;
  emptyDescription: string;
  showSearch: boolean;
  t: TranslateFn;
}

export function TeamInvitationsTableSection<TRow>(props: TeamInvitationsTableSectionProps<TRow>) {
  const { tableHook, placeholder, emptyTitle, emptyDescription, showSearch, t } = props;
  const empty = !tableHook.isLoading && tableHook.items.length === 0;
  const table = tableHook.table;
  const pageData = tableHook.pageData;
  const [density, setDensity] = useDataTableDensityPreference({ tableId: props.tableId });

  const toolbarLeft = showSearch ? (
    <div className="flex-1 min-w-0">
      <Input
        value={tableHook.searchInput}
        onChange={(event) => tableHook.setSearchInput(event.target.value)}
        placeholder={placeholder}
        allowClear
        variant="filled"
        prefix={<Search className="size-4 text-label-secondary" />}
        style={{ width: "100%" }}
      />
    </div>
  ) : null;

  const toolsLabels = buildDataTableToolsLabels(t);

  const toolbarRight = (
    <div className="flex items-center gap-2">
      <DataTableToolbarTools
        table={table}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void tableHook.refetch()}
        refreshing={tableHook.isFetching}
        onResetColumnVisibility={tableHook.resetColumnVisibility}
        labels={toolsLabels}
        components={{ IconButton: DataTableToolbarAntdIconButton }}
      />
    </div>
  );

  return (
    <div className="min-h-0 flex flex-col gap-4">
      <ContentGuard
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
        empty={empty}
        loadingVariant="table"
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        className="flex-1 min-h-0"
      >
        <DataTablePresenter
          table={table}
          className="flex-1 min-h-0"
          emptyText={t("team:TEAM_EMPTY_TABLE")}
          toolbar={{ left: toolbarLeft, right: toolbarRight }}
          density={density}
          refreshing={tableHook.isFetching && !tableHook.isLoading}
        />

        {pageData ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="text-label-secondary text-footnote">
              {t("team:TEAM_PAGINATION_TOTAL", {
                total: pageData.total,
                start: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
                end: Math.min(pageData.page * pageData.size, pageData.total),
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
      </ContentGuard>
    </div>
  );
}
