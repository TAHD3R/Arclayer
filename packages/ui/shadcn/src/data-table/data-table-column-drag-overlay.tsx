"use client";

import type { Table as ReactTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";

import { cn } from "@arclayer/lib/utils";

import { resolveDataTableRowHeight, type DataTableDensity, type DataTableRowHeight } from "./types";

const DEFAULT_OVERLAY_ROW_COUNT = 8;

type LegacyDensityProps = {
  density?: DataTableDensity;
  rowHeight?: DataTableRowHeight;
};

function resolveHeaderHeightClass(value?: DataTableRowHeight | DataTableDensity): string {
  const rowHeight = resolveDataTableRowHeight(value);
  if (rowHeight === "short") return "h-10";
  if (rowHeight === "tall") return "h-14";
  if (rowHeight === "extraTall") return "h-16";
  return "h-12";
}

function resolveCellPaddingClass(value?: DataTableRowHeight | DataTableDensity): string {
  const rowHeight = resolveDataTableRowHeight(value);
  if (rowHeight === "short") return "py-1.5";
  if (rowHeight === "tall") return "py-3";
  if (rowHeight === "extraTall") return "py-4";
  return "py-2";
}

function resolveOverlayWidth(columnWidth: number | null | undefined): number {
  const width = typeof columnWidth === "number" ? columnWidth : 0;
  if (!Number.isFinite(width) || width <= 0) return 240;
  return Math.round(width);
}

export function DataTableColumnDragOverlay<TData>(
  props: {
    table: ReactTable<TData>;
    columnId: string;
    width?: number | null;
    rowCount?: number;
  } & LegacyDensityProps,
) {
  const rows = props.table.getRowModel().rows;
  const overlayRows = rows.slice(0, props.rowCount ?? DEFAULT_OVERLAY_ROW_COUNT);
  const column = props.table.getColumn(props.columnId);
  const width = resolveOverlayWidth(props.width ?? column?.getSize() ?? null);
  const rowHeight = props.rowHeight ?? props.density;

  const header = props.table
    .getHeaderGroups()
    .flatMap((g) => g.headers)
    .find((h) => h.column.id === props.columnId);

  return (
    <div
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-lg opacity-80 ring-2 ring-ring/50",
        "bg-background outline outline-1 outline-border/60 box-border",
      )}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <div
        className={cn(
          "px-2 uppercase tracking-wider text-label-secondary text-callout font-semibold",
          "flex items-center border-b border-border/60 bg-background",
          resolveHeaderHeightClass(rowHeight),
        )}
      >
        <div className="truncate">
          {header
            ? flexRender(header.column.columnDef.header, header.getContext())
            : props.columnId}
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {overlayRows.map((row) => {
          const cell = row.getVisibleCells().find((c) => c.column.id === props.columnId);

          return (
            <div
              key={row.id}
              className={cn("px-2 bg-background", resolveCellPaddingClass(rowHeight))}
            >
              <div className="min-w-0 w-full overflow-hidden text-callout">
                {cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
