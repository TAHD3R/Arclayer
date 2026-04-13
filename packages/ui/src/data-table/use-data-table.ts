"use client";

import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { ColumnDef, SortingState, Table, VisibilityState } from "@tanstack/react-table";
import * as React from "react";

import {
  clearVisibilityState,
  readVisibilityState,
  writeVisibilityState,
  type DataTablePreferencesStorageOptions,
  type DataTableVisibilityStorageOptions,
} from "./storage";
import type {
  DataTableBaseQuery,
  DataTableFeatureOptions,
  MapColumnFiltersFn,
  PageData,
} from "./types";
import { useDataTableCore } from "./use-data-table-core";
import { useDataTableColumnOrderPreference } from "./use-data-table-column-order-preference";
import {
  buildRequestParams,
  normalizeSearchDefault,
  resolveDefaultColumnVisibility,
  stableStringify,
} from "./use-data-table-utils";

export type UseDataTableOptions<
  TData,
  TExtraQuery extends Record<string, unknown> = Record<string, unknown>,
> = {
  tableId: string;
  columns: ColumnDef<TData, unknown>[];
  fetcher: (params: DataTableBaseQuery & Partial<TExtraQuery>) => Promise<PageData<TData>>;
  extraQuery?: Partial<TExtraQuery>;
  /**
   * Override ordering string sent to backend.
   * Useful when sorting is controlled outside of react-table (e.g. a "Sort by" dropdown).
   */
  orderingOverride?: string;
  mapColumnFilters?: MapColumnFiltersFn<TExtraQuery>;
  search?: {
    debounceMs?: number;
    normalize?: (input: string) => string;
  };
  initialState?: {
    pageSize?: number;
    sorting?: SortingState;
    q?: string;
    columnPinning?: import("@tanstack/react-table").ColumnPinningState;
  };
  rowSelection?: {
    enabled?: boolean;
    getRowId?: (row: TData, index: number) => string;
  };
  features?: DataTableFeatureOptions;
  onSortingChange?: (next: SortingState, ordering: string | undefined) => void;
  queryOptions?: Omit<
    UseQueryOptions<PageData<TData>, unknown, PageData<TData>, readonly unknown[]>,
    "queryKey" | "queryFn" | "placeholderData"
  >;
  storage?: {
    visibility?: DataTableVisibilityStorageOptions;
    preferences?: DataTablePreferencesStorageOptions;
  };
};

export type UseDataTableResult<TData, TExtraQuery extends Record<string, unknown>> = {
  table: Table<TData>;

  // Search input (debounced and committed internally).
  searchInput: string;
  setSearchInput: (next: string) => void;

  // Debug / integration surface.
  requestParams: DataTableBaseQuery & Partial<TExtraQuery>;

  // Data.
  pageData: PageData<TData> | undefined;
  items: TData[];
  total: number;
  pageCount: number;

  // Sorting state.
  sorting: SortingState;
  setSorting: (next: SortingState) => void;

  // React Query state.
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;

  // Column visibility helpers.
  resetColumnVisibility: () => void;
};

export function useDataTable<
  TData,
  TExtraQuery extends Record<string, unknown> = Record<string, unknown>,
>(options: UseDataTableOptions<TData, TExtraQuery>): UseDataTableResult<TData, TExtraQuery> {
  const {
    tableId,
    columns,
    fetcher,
    extraQuery,
    orderingOverride,
    mapColumnFilters,
    initialState,
    rowSelection,
    features,
    onSortingChange,
    search,
    queryOptions,
    storage,
  } = options;

  const visibilityStorage = React.useMemo<DataTableVisibilityStorageOptions | undefined>(
    () => storage?.visibility,
    [storage?.visibility],
  );

  const preferencesStorage = React.useMemo<DataTablePreferencesStorageOptions | undefined>(
    () => storage?.preferences,
    [storage?.preferences],
  );

  const skipNextVisibilityPersistRef = React.useRef(false);

  const defaultVisibility = React.useMemo(() => resolveDefaultColumnVisibility(columns), [columns]);

  const columnOrderPreference = useDataTableColumnOrderPreference({
    tableId,
    columns,
    storage: preferencesStorage,
  });

  const initialVisibility = React.useMemo<VisibilityState | undefined>(() => {
    const persisted = readVisibilityState(tableId, visibilityStorage);
    if (persisted) return persisted;
    if (Object.keys(defaultVisibility).length) return defaultVisibility;
    return undefined;
  }, [defaultVisibility, tableId, visibilityStorage]);

  const [tableData, setTableData] = React.useState<TData[]>([]);
  const [pageCount, setPageCount] = React.useState<number>(0);

  const onColumnVisibilityChange = React.useCallback(
    (next: VisibilityState) => {
      if (skipNextVisibilityPersistRef.current) {
        skipNextVisibilityPersistRef.current = false;
        return;
      }
      writeVisibilityState(tableId, next, visibilityStorage);
    },
    [tableId, visibilityStorage],
  );

  const core = useDataTableCore<TData>({
    columns,
    data: tableData,
    pageCount,
    initialState: {
      pageSize: initialState?.pageSize ?? 10,
      sorting: initialState?.sorting,
      q: initialState?.q,
      columnVisibility: initialVisibility,
      columnPinning: initialState?.columnPinning,
      columnOrder: columnOrderPreference.initialColumnOrder,
    },
    rowSelection: {
      enabled: rowSelection?.enabled,
      getRowId: rowSelection?.getRowId,
      resetOnPaginationChange: true, // semantics A: selection is per-page
    },
    features,
    onSortingChange,
    onColumnVisibilityChange,
    onColumnOrderChange: columnOrderPreference.onColumnOrderChange,
  });

  // Search input (debounced commit).
  const [searchInput, setSearchInput] = React.useState<string>(() => initialState?.q ?? "");
  const debounceMs = search?.debounceMs ?? 350;
  const normalizeSearch = search?.normalize ?? normalizeSearchDefault;

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = normalizeSearch(searchInput);
      core.setCommittedSearch(next);
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [core, debounceMs, normalizeSearch, searchInput]);

  // Reset to page 1 when query parameters change (search/sort/filters/extraQuery).
  const mappedFilters = React.useMemo<Partial<TExtraQuery>>(() => {
    return mapColumnFilters?.(core.columnFilters) ?? {};
  }, [core.columnFilters, mapColumnFilters]);

  // Stabilize object-typed filters to avoid effect loops when callers pass inline objects.
  // `extraQuery` and `mappedFilters` are meant to be plain query params (serializable).
  const extraQueryKey = stableStringify(extraQuery ?? {});
  const mappedFiltersKey = stableStringify(mappedFilters);

  const stableExtraQuery = React.useMemo<Partial<TExtraQuery>>(
    () => extraQuery ?? {},
    [extraQueryKey],
  );

  const requestParams = React.useMemo(
    () => buildRequestParams(core.baseQuery, mappedFilters, stableExtraQuery),
    [core.baseQuery, mappedFilters, stableExtraQuery],
  );

  const finalRequestParams = React.useMemo(() => {
    if (!orderingOverride) return requestParams;
    return { ...requestParams, ordering: orderingOverride };
  }, [orderingOverride, requestParams]);

  React.useEffect(() => {
    // Any non-pagination change should bring user back to the first page.
    // (React Table uses 0-based; backend is 1-based.)
    core.table.setPageIndex(0);
    if (rowSelection?.enabled) core.table.resetRowSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    core.baseQuery.q,
    core.baseQuery.ordering,
    mappedFiltersKey,
    extraQueryKey,
    orderingOverride,
    rowSelection?.enabled,
  ]);

  const queryKey = React.useMemo(
    () => ["dataTable", tableId, finalRequestParams] as const,
    [finalRequestParams, tableId],
  );

  const query = useQuery({
    queryKey,
    queryFn: () => fetcher(finalRequestParams),
    placeholderData: keepPreviousData,
    ...queryOptions,
  });

  const pageData = query.data;
  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const nextPageCount = pageData?.pages ?? 0;

  React.useEffect(() => {
    // Avoid an update loop when `pageData` is still undefined:
    // `items` would be a new `[]` on each render, causing setState on every effect run.
    if (!pageData) return;
    setTableData(pageData.items ?? []);
    setPageCount(pageData.pages ?? 0);
  }, [pageData]);

  const resetColumnVisibility = React.useCallback(() => {
    clearVisibilityState(tableId, visibilityStorage);
    skipNextVisibilityPersistRef.current = true;
    core.table.setColumnVisibility(defaultVisibility);
  }, [core.table, defaultVisibility, tableId, visibilityStorage]);

  return {
    table: core.table,
    searchInput,
    setSearchInput,
    requestParams,
    pageData,
    items,
    total,
    pageCount: nextPageCount,
    sorting: core.sorting,
    setSorting: core.setSorting,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    resetColumnVisibility,
  } as const;
}
