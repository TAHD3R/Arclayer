"use client";

import * as React from "react";
import {
  type ColumnPinningState,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnSizingState,
  type ExpandedState,
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

import type { DataTableBaseQuery, DataTableFeatureOptions } from "./types";
import { applyMetaSortability, applyUpdater, buildOrdering, collectColumnSortKeys } from "./utils";

export type UseDataTableCoreOptions<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageCount: number;
  initialState?: {
    pageSize?: number;
    sorting?: SortingState;
    q?: string;
    columnVisibility?: VisibilityState;
    columnPinning?: ColumnPinningState;
    columnOrder?: ColumnOrderState;
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
  features?: DataTableFeatureOptions;
  onColumnVisibilityChange?: (next: VisibilityState) => void;
  onSortingChange?: (next: SortingState, ordering: string | undefined) => void;
};

export type UseDataTableCoreResult<TData> = {
  table: Table<TData>;
  baseQuery: DataTableBaseQuery;
  committedSearch: string;
  setCommittedSearch: (next: string) => void;
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  setSorting: (next: SortingState) => void;
};

export function useDataTableCore<TData>(
  options: UseDataTableCoreOptions<TData>,
): UseDataTableCoreResult<TData> {
  const { onColumnVisibilityChange, onSortingChange } = options;

  const sortingOptions = options.features?.sorting;
  const sortingEnabled = sortingOptions?.enabled ?? true;
  const sortingMode = sortingOptions?.mode ?? "server";

  const columnsWithSorting = React.useMemo(
    () => (sortingEnabled ? applyMetaSortability(options.columns) : options.columns),
    [options.columns, sortingEnabled],
  );

  const sortKeyByColumnId = React.useMemo(
    () => collectColumnSortKeys(columnsWithSorting),
    [columnsWithSorting],
  );

  // Auto-detect actions/select columns and derive initial pinning state.
  const autoPinning = React.useMemo<ColumnPinningState>(() => {
    const right: string[] = [];
    for (const col of options.columns) {
      const id = col.id ?? (col as { accessorKey?: string }).accessorKey;
      if (!id) continue;
      const meta = col.meta as { kind?: string } | undefined;
      if (meta?.kind === "actions" || id === "actions") right.push(id);
    }
    return right.length > 0 ? { right } : {};
  }, [options.columns]);

  const hasAutoPinning = (autoPinning.left?.length ?? 0) + (autoPinning.right?.length ?? 0) > 0;

  const [committedSearch, setCommittedSearch] = React.useState(() => options.initialState?.q ?? "");
  const [sorting, setSorting] = React.useState<SortingState>(
    () => options.initialState?.sorting ?? [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    () => options.initialState?.columnVisibility ?? {},
  );
  const [columnPinning, setColumnPinning] = React.useState<ColumnPinningState>(() => {
    const explicit = options.initialState?.columnPinning;
    if (!hasAutoPinning) return explicit ?? {};
    // Merge: explicit takes precedence, auto-detected ids are appended.
    const left = [...(explicit?.left ?? []), ...(autoPinning.left ?? [])];
    const right = [...(explicit?.right ?? []), ...(autoPinning.right ?? [])];
    return {
      ...(left.length > 0 ? { left: [...new Set(left)] } : {}),
      ...(right.length > 0 ? { right: [...new Set(right)] } : {}),
    };
  });
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(
    () => options.initialState?.columnOrder ?? [],
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: options.initialState?.pageSize ?? 10,
  }));

  const ordering = React.useMemo(() => {
    if (!sortingEnabled) return undefined;
    if (sortingMode !== "server") return undefined;
    return buildOrdering(sorting, sortKeyByColumnId);
  }, [sortKeyByColumnId, sorting, sortingEnabled, sortingMode]);

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

  const handleSortingChange: OnChangeFn<SortingState> = React.useCallback(
    (updater) => {
      setSorting((prev) => {
        const next = applyUpdater(updater, prev);
        const nextOrdering =
          sortingEnabled && sortingMode === "server"
            ? buildOrdering(next, sortKeyByColumnId)
            : undefined;
        onSortingChange?.(next, nextOrdering);
        return next;
      });
    },
    [onSortingChange, sortKeyByColumnId, sortingEnabled, sortingMode],
  );

  const table = useReactTable({
    data: options.data,
    columns: columnsWithSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),

    // Server-side by default.
    manualPagination: true,
    manualSorting: sortingEnabled && sortingMode === "server",
    manualFiltering: true,
    pageCount: options.pageCount,

    enableSorting: sortingEnabled,
    enableMultiSort: sortingOptions?.multiSort ?? true,
    enableSortingRemoval: sortingOptions?.allowRemoval ?? true,
    enableColumnPinning: options.features?.columnPinning?.enabled ?? hasAutoPinning,
    enableColumnResizing: options.features?.columnSizing?.enabled ?? false,
    enableExpanding: options.features?.rowExpansion?.enabled ?? false,

    // Row selection is opt-in.
    enableRowSelection: options.rowSelection?.enabled ?? false,
    getRowId: options.rowSelection?.getRowId
      ? (row, index) => options.rowSelection?.getRowId?.(row, index) ?? String(index)
      : undefined,

    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onColumnPinningChange: setColumnPinning,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: handlePaginationChange,

    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnPinning,
      columnOrder,
      columnSizing,
      expanded,
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
    sorting,
    setSorting,
  } as const;
}
