"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  type OnChangeFn,
  getPaginationRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";

import type { DataTableBaseQuery } from "@/components/customized/table/types";
import {
  applyUpdater,
  buildOrdering,
  collectColumnSortKeys,
} from "@/components/customized/table/utils";

export type UseDataTableCoreOptions<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageCount: number;
  initialState?: {
    pageSize?: number;
    sorting?: SortingState;
    q?: string;
    columnVisibility?: VisibilityState;
  };
  rowSelection?: {
    enabled?: boolean;
    getRowId?: (row: TData, index: number) => string;
    /**
     * When true, clear selection whenever pagination changes (pageIndex/pageSize).
     * This matches the "selection only applies to current page" semantics.
     */
    resetOnPaginationChange?: boolean;
  };
  onColumnVisibilityChange?: (next: VisibilityState) => void;
};

export type UseDataTableCoreResult<TData> = {
  table: Table<TData>;
  baseQuery: DataTableBaseQuery;
  committedSearch: string;
  setCommittedSearch: (next: string) => void;
  columnFilters: ColumnFiltersState;
};

export function useDataTableCore<TData>(
  options: UseDataTableCoreOptions<TData>,
): UseDataTableCoreResult<TData> {
  const { onColumnVisibilityChange } = options;

  const sortKeyByColumnId = React.useMemo(
    () => collectColumnSortKeys(options.columns),
    [options.columns],
  );

  const [committedSearch, setCommittedSearch] = React.useState(() => options.initialState?.q ?? "");
  const [sorting, setSorting] = React.useState<SortingState>(
    () => options.initialState?.sorting ?? [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    () => options.initialState?.columnVisibility ?? {},
  );
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: options.initialState?.pageSize ?? 10,
  }));

  const ordering = React.useMemo(
    () => buildOrdering(sorting, sortKeyByColumnId),
    [sortKeyByColumnId, sorting],
  );

  const q = committedSearch.trim();
  const baseQuery: DataTableBaseQuery = React.useMemo(
    () => ({
      page: pagination.pageIndex + 1,
      size: pagination.pageSize,
      q: q ? q : undefined,
      ordering,
    }),
    [ordering, pagination.pageIndex, pagination.pageSize, q],
  );

  const handleColumnVisibilityChange: OnChangeFn<VisibilityState> = React.useCallback(
    (updater) => {
      setColumnVisibility((prev) => {
        const next = applyUpdater(updater, prev);
        onColumnVisibilityChange?.(next);
        return next;
      });
    },
    [onColumnVisibilityChange],
  );

  const handlePaginationChange: OnChangeFn<PaginationState> = React.useCallback(
    (updater) => {
      setPagination((prev) => {
        const next = applyUpdater(updater, prev);
        const shouldResetSelection =
          options.rowSelection?.enabled && options.rowSelection?.resetOnPaginationChange !== false;
        if (
          shouldResetSelection &&
          (next.pageIndex !== prev.pageIndex || next.pageSize !== prev.pageSize)
        ) {
          setRowSelection({});
        }
        return next;
      });
    },
    [options.rowSelection?.enabled, options.rowSelection?.resetOnPaginationChange],
  );

  const table = useReactTable({
    data: options.data,
    columns: options.columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),

    // Server-side by default.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: options.pageCount,

    // Row selection is opt-in.
    enableRowSelection: options.rowSelection?.enabled ?? false,
    getRowId: options.rowSelection?.getRowId
      ? (row, index) => options.rowSelection?.getRowId?.(row, index) ?? String(index)
      : undefined,

    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: handlePaginationChange,

    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  });

  return {
    table,
    baseQuery,
    committedSearch,
    setCommittedSearch,
    columnFilters,
  } as const;
}
