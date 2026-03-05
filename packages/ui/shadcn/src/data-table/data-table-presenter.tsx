"use client";

import {
  flexRender,
  type Cell,
  type Header,
  type Row,
  type Table as ReactTable,
} from "@tanstack/react-table";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@celestial/ui/table";
import { cn } from "@celestial/lib/utils";

import {
  SortStateIcon,
  resolveCellPinStyle,
  resolveHeaderAlignClass,
  resolveHeaderJustifyClass,
  resolveHeaderPinStyle,
  shouldIgnoreRowClick,
} from "./data-table-presenter-utils";

type DataTablePresenterProps<TData> = {
  table: ReactTable<TData>;
  emptyText: string;
  className?: string;
  tableClassName?: string;
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

export function DataTablePresenter<TData>(props: DataTablePresenterProps<TData>) {
  const {
    table,
    emptyText,
    className,
    tableClassName,
    rowClassName,
    onRowClick,
    headerCellClassName,
    cellClassName,
  } = props;

  const scrollRef = useRef<HTMLDivElement>(null);
  const canScrollRight = useScrollOverflow(scrollRef);

  // Compute total width of right-pinned columns for gradient positioning.
  const rightPinnedWidth = table.getRightLeafColumns().reduce((sum, col) => sum + col.getSize(), 0);
  const hasRightPinned = rightPinnedWidth > 0;

  return (
    <div ref={scrollRef} className={cn("relative isolate overflow-auto bg-transparent", className)}>
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
      <table className={cn("w-full caption-bottom text-callout", tableClassName)}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-border/40 hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const alignClass = resolveHeaderAlignClass(header);
                const justifyClass = resolveHeaderJustifyClass(alignClass);
                const pinStyle = resolveHeaderPinStyle(header);
                const sortKey = String(header.column.columnDef.meta?.sortKey ?? "").trim();
                const canSort = Boolean(sortKey) && header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const ariaSort =
                  sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
                const content = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());

                return (
                  <TableHead
                    key={header.id}
                    aria-sort={canSort ? ariaSort : undefined}
                    className={cn(
                      alignClass,
                      pinStyle.className,
                      "uppercase tracking-wider text-label-secondary",
                      headerCellClassName?.(header),
                    )}
                    style={pinStyle.style}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className={cn(
                          "group inline-flex items-center gap-1 rounded-sm px-1 py-1 transition-colors hover:bg-muted/50",
                          justifyClass,
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="truncate">{content}</span>
                        <SortStateIcon state={sorted} />
                      </button>
                    ) : (
                      content
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

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
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn("overflow-hidden", pinStyle.className, cellClassName?.(cell))}
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
    </div>
  );
}
