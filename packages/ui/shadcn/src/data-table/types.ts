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

export type DataTableDensity = "compact" | "default" | "relaxed";

export type MapColumnFiltersFn<TExtraQuery extends Record<string, unknown>> = (
  filters: ColumnFiltersState,
) => Partial<TExtraQuery>;

export type DataTableInitialState = {
  pageSize?: number;
  sorting?: SortingState;
  q?: string;
};

export type DataTableSortingFeature = {
  enabled?: boolean;
  mode?: "server" | "client";
  multiSort?: boolean;
  allowRemoval?: boolean;
};

export type DataTableFeatureOptions = {
  sorting?: DataTableSortingFeature;
  // Extension points reserved for future rollout.
  columnPinning?: { enabled?: boolean };
  columnSizing?: { enabled?: boolean };
  rowExpansion?: { enabled?: boolean };
};
