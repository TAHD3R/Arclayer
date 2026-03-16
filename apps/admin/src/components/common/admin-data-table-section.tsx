import type { ReactNode } from "react";
import type { Header, Row, Table as ReactTable } from "@tanstack/react-table";

import {
  DataTablePresenter,
  type PageData,
  type DataTableRowHeight,
} from "@arclayer/ui/data-table";

import { ContentGuard } from "@/components/common/content-guard";
import { DataPaginationControls } from "@/components/common/data-pagination-controls";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type AdminDataTableSectionProps<TData> = {
  table: ReactTable<TData>;
  emptyText: string;
  emptyTitle: string;
  emptyDescription: string;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  pageData?: PageData<TData> | null;
  onPaginationChange?: (nextPage: number, nextSize: number) => void;
  t: TranslateFn;
  rowHeight: DataTableRowHeight;
  wrapHeaders?: boolean;
  refreshing?: boolean;
  rowClassName?: (row: Row<TData>, rowIndex: number) => string | undefined;
  onRowClick?: (
    row: Row<TData>,
    rowIndex: number,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => void;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  cellClassName?: (
    cell: import("@tanstack/react-table").Cell<TData, unknown>,
  ) => string | undefined;
  footerSlot?: ReactNode;
};

export function AdminDataTableSection<TData>({
  table,
  emptyText,
  emptyTitle,
  emptyDescription,
  loading,
  error,
  onRetry,
  pageData,
  onPaginationChange,
  t,
  rowHeight,
  wrapHeaders = false,
  refreshing = false,
  rowClassName,
  onRowClick,
  headerCellClassName,
  cellClassName,
  footerSlot,
}: AdminDataTableSectionProps<TData>) {
  const empty = !loading && table.getRowModel().rows.length === 0;

  return (
    <div className="min-h-0 flex flex-col gap-4">
      <ContentGuard
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={empty}
        loadingVariant="table"
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        className="flex-1 min-h-0"
      >
        <DataTablePresenter
          table={table}
          className="flex-1 min-h-0"
          emptyText={emptyText}
          rowHeight={rowHeight}
          wrapHeaders={wrapHeaders}
          refreshing={refreshing}
          refreshingLabel={t("common:DATA_TABLE_REFRESHING")}
          columnMenuLabels={{
            sortAscending: t("common:DATA_TABLE_SORT_ASCENDING"),
            sortDescending: t("common:DATA_TABLE_SORT_DESCENDING"),
            hideColumn: t("common:DATA_TABLE_HIDE_COLUMN"),
          }}
          rowClassName={rowClassName}
          onRowClick={onRowClick}
          headerCellClassName={headerCellClassName}
          cellClassName={cellClassName}
        />

        {pageData && onPaginationChange ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="text-label-secondary text-footnote">
              {t("team:TEAM_PAGINATION_TOTAL", {
                total: pageData.total,
                start: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
                end: Math.min(pageData.page * pageData.size, pageData.total),
              })}
            </div>
            <DataPaginationControls
              page={pageData.page}
              size={pageData.size}
              total={pageData.total}
              onChange={onPaginationChange}
              t={t}
            />
          </div>
        ) : null}

        {footerSlot}
      </ContentGuard>
    </div>
  );
}
