import type { ReactNode } from "react";
import type { Header, Row, Table as ReactTable } from "@tanstack/react-table";

import {
  DataTablePresenter,
  type PageData,
  type DataTableRowHeight,
} from "@arclayer/ui/data-table";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DataPaginationControls } from "@/components/common/data-pagination-controls";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type AdminDataTableSectionProps<TData> = {
  table: ReactTable<TData>;
  emptyText: string;
  emptyTitle: ReactNode;
  emptyDescription: ReactNode;
  emptyExtra?: ReactNode;
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
  toolbar?: ReactNode;
  footerSlot?: ReactNode;
};

export function AdminDataTableSection<TData>({
  table,
  emptyText,
  emptyTitle,
  emptyDescription,
  emptyExtra,
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
  toolbar,
  footerSlot,
}: AdminDataTableSectionProps<TData>) {
  const empty = !loading && table.getRowModel().rows.length === 0;
  const detachedToolbar =
    empty && toolbar ? (
      <div className="shrink-0 border-b border-border/60 bg-muted/[0.04] px-0 py-3">
        <div className="min-w-0">{toolbar}</div>
      </div>
    ) : null;
  const paginationFooter =
    pageData && onPaginationChange ? (
      <DataPaginationControls
        page={pageData.page}
        size={pageData.size}
        total={pageData.total}
        onChange={onPaginationChange}
        t={t}
      />
    ) : null;
  const footer =
    paginationFooter && footerSlot ? (
      <div className="flex flex-col gap-3">
        {paginationFooter}
        {footerSlot}
      </div>
    ) : (
      (paginationFooter ?? footerSlot)
    );

  return (
    <div className="min-h-0 flex flex-col">
      {detachedToolbar}
      <ContentGuard
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={empty}
        loadingVariant="table"
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyExtra={emptyExtra}
        className="flex-1 min-h-0"
      >
        <DataTablePresenter
          table={table}
          className="flex-1 min-h-0"
          emptyText={emptyText}
          toolbar={!empty && toolbar ? { fullWidth: toolbar } : undefined}
          footer={footer}
          surface="card"
          rowHeight={rowHeight}
          wrapHeaders={wrapHeaders}
          refreshing={refreshing}
          refreshingLabel={t("common:DATA_TABLE_REFRESHING")}
          columnMenuLabels={{
            sort: t("common:DATA_TABLE_SORT"),
            filter: t("common:DATA_TABLE_FILTER"),
            sortAscending: t("common:DATA_TABLE_SORT_ASCENDING"),
            sortDescending: t("common:DATA_TABLE_SORT_DESCENDING"),
            wrapContent: t("common:DATA_TABLE_WRAP_CONTENT"),
            unwrapContent: t("common:DATA_TABLE_UNWRAP_CONTENT"),
            hide: t("common:DATA_TABLE_HIDE"),
          }}
          rowClassName={rowClassName}
          onRowClick={onRowClick}
          headerCellClassName={headerCellClassName}
          cellClassName={cellClassName}
        />
      </ContentGuard>
    </div>
  );
}
