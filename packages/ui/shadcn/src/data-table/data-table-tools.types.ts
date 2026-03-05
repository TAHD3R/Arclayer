"use client";

import type * as React from "react";

import type { DataTableDensity } from "./types";

export type DataTableToolsLabels = {
  columns: string;
  columnsTitle: string;
  columnsDescription: string;
  columnsLockedHint: string;
  density: string;
  densityCompact: string;
  densityDefault: string;
  densityRelaxed: string;
  refresh: string;
  reset: string;
  pinLeft: string;
  pinRight: string;
  pinNone: string;
  moveUp: string;
  moveDown: string;
  confirm: string;
  drag: string;
};

export type DataTableIconButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
};

export type DataTableToolsComponents = {
  IconButton?: React.ComponentType<DataTableIconButtonProps>;
};

export type DataTableToolbarToolsProps<TData> = {
  table: import("@tanstack/react-table").Table<TData>;
  density: DataTableDensity;
  onDensityChange: (next: DataTableDensity) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  labels: DataTableToolsLabels;
  components?: DataTableToolsComponents;
  /**
   * Optional integration with `useDataTable()`:
   * clears persisted visibility state before resetting visibility.
   */
  onResetColumnVisibility?: () => void;
};
