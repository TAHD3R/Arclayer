"use client";

import {
  flexRender,
  type Cell,
  type Header,
  type Row,
  type Table as ReactTable,
} from "@tanstack/react-table";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TableBody, TableCell, TableRow } from "@celestial/ui/table";
import { cn } from "@celestial/lib/utils";

import { resolveCellPinStyle, shouldIgnoreRowClick } from "./data-table-presenter-utils";
import { DataTablePresenterHeader } from "./data-table-presenter-header";
import {
  isDataTableColumnLocked,
  moveDataTableColumnInUnlockedZone,
  resolveDataTableColumnLabel,
  useNormalizedDataTableColumnOrder,
} from "./data-table-column-settings-utils";
import type { DataTableDensity } from "./types";

type DataTableToolbarSlots = {
  fullWidth?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
};

type ColumnMeta = { kind?: string };

const HEADER_DRAG_DISTANCE_PX = 6;

type DataTablePresenterProps<TData> = {
  table: ReactTable<TData>;
  emptyText: string;
  className?: string;
  tableClassName?: string;
  toolbar?: DataTableToolbarSlots;
  density?: DataTableDensity;
  rowClassName?: (row: Row<TData>, rowIndex: number) => string | undefined;
  onRowClick?: (row: Row<TData>, rowIndex: number, event: MouseEvent<HTMLTableRowElement>) => void;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  cellClassName?: (cell: Cell<TData, unknown>) => string | undefined;
};

/**
 * Detect whether the scroll container has overflow on the right side.
 * Returns true when there is still content to scroll to the right.
 */
function useScrollOverflow(ref: React.RefObject<HTMLDivElement | null>) {
  const [canScrollRight, setCanScrollRight] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px tolerance for sub-pixel rounding
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    check();
    el.addEventListener("scroll", check, { passive: true });

    // ResizeObserver may be unavailable in test environments (jsdom).
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);

    return () => {
      el.removeEventListener("scroll", check);
      ro?.disconnect();
    };
  }, [ref, check]);

  return canScrollRight;
}

function resolveCellDensityClass(density: DataTableDensity): string {
  if (density === "compact") return "py-1.5";
  if (density === "relaxed") return "py-3";
  return "";
}

function isSelectColumn(meta: unknown, columnId: string): boolean {
  const kind = (meta as ColumnMeta | undefined)?.kind;
  return kind === "select" || columnId === "select";
}

export function DataTablePresenter<TData>(props: DataTablePresenterProps<TData>) {
  const {
    table,
    emptyText,
    className,
    tableClassName,
    toolbar,
    density = "default",
    rowClassName,
    onRowClick,
    headerCellClassName,
    cellClassName,
  } = props;

  const hasToolbarRow = Boolean(toolbar?.left || toolbar?.right);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canScrollRight = useScrollOverflow(scrollRef);

  // Compute total width of right-pinned columns for gradient positioning.
  const rightPinnedWidth = table.getRightLeafColumns().reduce((sum, col) => sum + col.getSize(), 0);
  const hasRightPinned = rightPinnedWidth > 0;

  const normalizedOrder = useNormalizedDataTableColumnOrder(table);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: HEADER_DRAG_DISTANCE_PX } }),
  );

  const [activeHeaderId, setActiveHeaderId] = useState<string | null>(null);
  const [overHeaderId, setOverHeaderId] = useState<string | null>(null);

  const onHeaderDragStart = useCallback((e: DragStartEvent) => {
    setActiveHeaderId(String(e.active.id));
  }, []);

  const onHeaderDragEnd = useCallback(
    (e: DragEndEvent) => {
      const nextOverId = e.over ? String(e.over.id) : null;
      const nextActiveId = String(e.active.id);

      setActiveHeaderId(null);
      setOverHeaderId(null);

      if (!nextOverId) return;
      if (nextOverId === nextActiveId) return;
      if (isDataTableColumnLocked(nextActiveId) || isDataTableColumnLocked(nextOverId)) return;

      const activePinned = table.getColumn(nextActiveId)?.getIsPinned() ?? false;
      const overPinned = table.getColumn(nextOverId)?.getIsPinned() ?? false;
      if (activePinned !== overPinned) return;

      table.setColumnOrder(
        moveDataTableColumnInUnlockedZone(normalizedOrder, nextActiveId, nextOverId),
      );
    },
    [normalizedOrder, table],
  );

  const activeHeaderLabel = useMemo(() => {
    if (!activeHeaderId) return null;
    const col = table.getColumn(activeHeaderId);
    if (!col) return activeHeaderId;
    return resolveDataTableColumnLabel({ id: col.id, columnDef: col.columnDef });
  }, [activeHeaderId, table]);

  return (
    <div className={cn("min-h-0 flex flex-col", className)}>
      {toolbar?.fullWidth ? <div className="pb-3">{toolbar.fullWidth}</div> : null}

      {hasToolbarRow ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">{toolbar?.left}</div>
          <div className="flex shrink-0 items-center gap-2">{toolbar?.right}</div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn("relative isolate flex-1 min-h-0 overflow-auto bg-transparent")}
      >
        {/* Scroll overflow gradient — visible only when right side has hidden content */}
        {hasRightPinned && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 z-25 w-10 transition-opacity duration-200",
              canScrollRight ? "opacity-100" : "opacity-0",
            )}
            style={{
              right: rightPinnedWidth,
              background: "linear-gradient(to right, transparent, hsl(var(--background) / 0.6))",
            }}
          />
        )}

        {/* Render <table> directly — the Table component adds a nested overflow-auto
            wrapper that would capture scroll events before our scrollRef container. */}
        <DndContext
          sensors={sensors}
          onDragStart={onHeaderDragStart}
          onDragOver={(e) => setOverHeaderId(e.over ? String(e.over.id) : null)}
          onDragEnd={onHeaderDragEnd}
          onDragCancel={() => {
            setActiveHeaderId(null);
            setOverHeaderId(null);
          }}
        >
          <table className={cn("w-full caption-bottom text-callout", tableClassName)}>
            <DataTablePresenterHeader
              table={table}
              density={density}
              headerCellClassName={headerCellClassName}
              dragging={{ overId: overHeaderId }}
            />

            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row, rowIndex) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "group/row bg-background transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted/50 last:border-b-0",
                      rowClassName?.(row, rowIndex),
                    )}
                    onClick={(event) => {
                      if (!onRowClick) return;
                      if (shouldIgnoreRowClick(event.target)) return;
                      onRowClick(row, rowIndex, event);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const pinStyle = resolveCellPinStyle(cell);
                      const selectColumn = isSelectColumn(
                        cell.column.columnDef.meta,
                        cell.column.id,
                      );
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "overflow-hidden",
                            pinStyle.className,
                            resolveCellDensityClass(density),
                            selectColumn ? "px-0" : "",
                            cellClassName?.(cell),
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
                  <TableCell
                    className="h-24 text-center text-label-secondary"
                    colSpan={table.getVisibleLeafColumns().length}
                  >
                    {emptyText}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>

          <DragOverlay>
            {activeHeaderLabel ? (
              <div className="rounded-lg border bg-background px-3 py-2 shadow-xl">
                <div className="text-footnote font-medium">{activeHeaderLabel}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
