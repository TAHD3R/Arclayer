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
export type DataTableRowHeight = "short" | "medium" | "tall" | "extraTall";

export const DATA_TABLE_ROW_HEIGHT_OPTIONS = [
  "short",
  "medium",
  "tall",
  "extraTall",
] as const satisfies readonly DataTableRowHeight[];

export function isDataTableDensity(value: unknown): value is DataTableDensity {
  return value === "compact" || value === "default" || value === "relaxed";
}

export function isDataTableRowHeight(value: unknown): value is DataTableRowHeight {
  return DATA_TABLE_ROW_HEIGHT_OPTIONS.includes(value as DataTableRowHeight);
}

export function resolveDataTableRowHeight(
  value?: DataTableRowHeight | DataTableDensity | null,
): DataTableRowHeight {
  if (value === "compact") return "short";
  if (value === "relaxed") return "tall";
  if (value === "default") return "medium";
  if (isDataTableRowHeight(value)) return value;
  return "medium";
}

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
