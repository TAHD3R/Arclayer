"use client";

import type * as React from "react";

import type { DataTableDensity, DataTableRowHeight } from "./types";

export type DataTableToolsLabels = {
  viewOptions: string;
  viewOptionsTitle: string;
  viewOptionsDescription: string;
  tableSettings: string;
  columns: string;
  columnsTitle: string;
  columnsDescription: string;
  columnsSearchPlaceholder: string;
  columnsEmpty: string;
  rowHeight: string;
  rowHeightTitle: string;
  rowHeightShort: string;
  rowHeightMedium: string;
  rowHeightTall: string;
  rowHeightExtraTall: string;
  headerOptions: string;
  wrapHeaders: string;
  refresh: string;
  reset: string;
  resetColumnSize: string;
  resetColumnOrder: string;
  clearSelection: string;
  sort: string;
  filter: string;
  sortAscending: string;
  sortDescending: string;
  wrapContent: string;
  unwrapContent: string;
  hide: string;
  moveUp: string;
  moveDown: string;
  drag: string;
  refreshing: string;
  customize: string;
  customizeTitle: string;
  customizeDescription: string;
  density: string;
  densityCompact: string;
  densityDefault: string;
  densityRelaxed: string;
};

export type DataTableColumnMenuLabels = Pick<
  DataTableToolsLabels,
  "sort" | "filter" | "sortAscending" | "sortDescending" | "wrapContent" | "unwrapContent" | "hide"
>;

export type DataTableIconButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "ghost" | "outline";
  children: React.ReactNode;
};

export type DataTableToolsComponents = {
  IconButton?: React.ComponentType<DataTableIconButtonProps>;
};

export type DataTableToolbarToolsProps<TData> = {
  table: import("@tanstack/react-table").Table<TData>;
  rowHeight?: DataTableRowHeight;
  onRowHeightChange?: (next: DataTableRowHeight) => void;
  wrapHeaders?: boolean;
  onWrapHeadersChange?: (next: boolean) => void;
  density?: DataTableDensity;
  onDensityChange?: (next: DataTableDensity) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  labels: DataTableToolsLabels;
  components?: DataTableToolsComponents;
  onResetColumnVisibility?: () => void;
};
