import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type DataTableBaseQuery = {
  page: number; // 1-based
  size: number;
  q?: string;
  ordering?: string;
};

export type MapColumnFiltersFn<TExtraQuery extends Record<string, unknown>> = (
  filters: ColumnFiltersState,
) => Partial<TExtraQuery>;

export type DataTableInitialState = {
  pageSize?: number;
  sorting?: SortingState;
  q?: string;
};
