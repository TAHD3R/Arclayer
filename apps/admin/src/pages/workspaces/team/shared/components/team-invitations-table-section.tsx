import { type Table } from "@tanstack/react-table";

import type { DataTableInfiniteScrollState, DataTableRowHeight } from "@arclayer/ui/data-table";

import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

interface DataTableLike<TRow> {
  isLoading: boolean;
  isFetching: boolean;
  items: TRow[];
  error: unknown;
  refetch: () => Promise<unknown> | void;
  resetColumnVisibility?: () => void;
  table: Table<TRow>;
  infiniteScroll: DataTableInfiniteScrollState;
  searchInput: string;
  setSearchInput: (value: string) => void;
}

interface TeamInvitationsTableSectionProps<TRow> {
  tableHook: DataTableLike<TRow>;
  emptyTitle: string;
  emptyDescription: string;
  t: TranslateFn;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
}

export function TeamInvitationsTableSection<TRow>(props: TeamInvitationsTableSectionProps<TRow>) {
  const { tableHook, emptyTitle, emptyDescription, t, rowHeight, wrapHeaders } = props;

  return (
    <AdminDataTableSection
      table={tableHook.table}
      emptyText={t("team:TEAM_EMPTY_TABLE")}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      loading={tableHook.isLoading}
      error={tableHook.error}
      onRetry={() => void tableHook.refetch()}
      infiniteScroll={tableHook.infiniteScroll}
      t={t}
      rowHeight={rowHeight}
      wrapHeaders={wrapHeaders}
      refreshing={tableHook.isFetching && !tableHook.isLoading}
    />
  );
}
