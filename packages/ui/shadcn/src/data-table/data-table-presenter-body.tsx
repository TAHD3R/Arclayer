"use client";

import { flexRender, type Cell, type Row, type Table as ReactTable } from "@tanstack/react-table";

import { cn } from "@arclayer/lib/utils";
import { TableBody, TableCell, TableRow } from "@arclayer/ui/table";

import { resolveCellPinStyle, shouldIgnoreRowClick } from "./data-table-presenter-utils";
import type { DataTableRowHeight } from "./types";

type ColumnMeta = { kind?: string };

const ACTIVE_COLUMN_FADE_CLASS = "opacity-35";
const HOVERED_COLUMN_BG_CLASS = "bg-accent/25";
const COLUMN_OVER_BG_CLASS = "bg-muted/60";

function resolveCellPaddingClass(rowHeight: DataTableRowHeight): string {
  if (rowHeight === "short") return "py-1.5";
  if (rowHeight === "tall") return "py-3.5";
  if (rowHeight === "extraTall") return "py-5";
  return "py-2.5";
}

function isSelectColumn(meta: unknown, columnId: string): boolean {
  const kind = (meta as ColumnMeta | undefined)?.kind;
  return kind === "select" || columnId === "select";
}

export function DataTablePresenterBody<TData>(props: {
  table: ReactTable<TData>;
  emptyText: string;
  rowHeight: DataTableRowHeight;
  activeColumnId: string | null;
  overColumnId: string | null;
  hoveredColumnId: string | null;
  rowClassName?: (row: Row<TData>, rowIndex: number) => string | undefined;
  onRowClick?: (
    row: Row<TData>,
    rowIndex: number,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => void;
  cellClassName?: (cell: Cell<TData, unknown>) => string | undefined;
}) {
  const rows = props.table.getRowModel().rows;
  const colSpan = props.table.getVisibleLeafColumns().length;

  return (
    <TableBody>
      {rows.length ? (
        rows.map((row, rowIndex) => (
          <TableRow
            key={row.id}
            className={cn(
              "group/row bg-background transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted/50 last:border-b-0",
              props.rowClassName?.(row, rowIndex),
            )}
            onClick={(event) => {
              if (!props.onRowClick) return;
              if (shouldIgnoreRowClick(event.target)) return;
              props.onRowClick(row, rowIndex, event);
            }}
          >
            {row.getVisibleCells().map((cell) => {
              const pinStyle = resolveCellPinStyle(cell);
              const selectColumn = isSelectColumn(cell.column.columnDef.meta, cell.column.id);
              const isActiveColumn = Boolean(
                props.activeColumnId && cell.column.id === props.activeColumnId,
              );
              const isHoveredColumn = Boolean(
                props.hoveredColumnId && cell.column.id === props.hoveredColumnId,
              );
              const isOverColumn = Boolean(
                props.overColumnId && cell.column.id === props.overColumnId,
              );

              return (
                <TableCell
                  key={cell.id}
                  data-column-id={cell.column.id}
                  className={cn(
                    "overflow-hidden transition-colors duration-150",
                    pinStyle.className,
                    resolveCellPaddingClass(props.rowHeight),
                    selectColumn ? "px-0" : "",
                    isActiveColumn ? ACTIVE_COLUMN_FADE_CLASS : "",
                    isHoveredColumn ? HOVERED_COLUMN_BG_CLASS : "",
                    isOverColumn ? COLUMN_OVER_BG_CLASS : "",
                    props.cellClassName?.(cell),
                  )}
                  style={pinStyle.style}
                >
                  <div className="min-w-0 w-full overflow-hidden">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                </TableCell>
              );
            })}
          </TableRow>
        ))
      ) : (
        <TableRow className="border-border/40 hover:bg-transparent last:border-b-0">
          <TableCell className="h-24 text-center text-label-secondary" colSpan={colSpan}>
            {props.emptyText}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}
