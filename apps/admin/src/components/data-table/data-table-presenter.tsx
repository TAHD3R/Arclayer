"use client";

import {
  flexRender,
  type Cell,
  type Header,
  type Row,
  type Table as ReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

type AlignClass = "text-left" | "text-center" | "text-right";

type PinStyleState = {
  className: string | undefined;
  style: CSSProperties;
};

function resolveHeaderAlignClass<TData>(header: Header<TData, unknown>): AlignClass {
  const meta = header.column.columnDef.meta;
  if (meta?.headerAlign === "left") return "text-left";
  if (meta?.headerAlign === "right") return "text-right";
  if (meta?.headerAlign === "center") return "text-center";

  if (meta?.kind === "actions" || header.column.id === "actions") return "text-right";
  if (meta?.kind === "select" || header.column.id === "select") return "text-center";

  return "text-left";
}

function resolveHeaderJustifyClass(align: AlignClass): string {
  if (align === "text-left") return "justify-start";
  if (align === "text-right") return "justify-end";
  return "justify-center";
}

function SortStateIcon(props: { state: false | "asc" | "desc" }) {
  if (props.state === "asc") return <ArrowUp className="size-3.5 text-foreground" />;
  if (props.state === "desc") return <ArrowDown className="size-3.5 text-foreground" />;
  return (
    <ArrowUpDown className="size-3.5 text-label-secondary/40 transition-colors group-hover:text-foreground/80" />
  );
}

function resolveColumnBaseStyle<TData>(
  column: Header<TData, unknown>["column"],
  pinned?: "left" | "right" | false,
): CSSProperties {
  const size = column.getSize();
  if (!size) return {};
  // Pinned columns use minWidth only — let content determine actual width
  // so buttons/icons in actions columns are never clipped.
  if (pinned) {
    return { minWidth: size };
  }
  return {
    width: size,
    minWidth: size,
    maxWidth: size,
  };
}

function resolveHeaderPinStyle<TData>(header: Header<TData, unknown>): PinStyleState {
  const pinned = header.column.getIsPinned();
  const style: CSSProperties = resolveColumnBaseStyle(header.column, pinned);

  if (!pinned) return { className: undefined, style };

  if (pinned === "left") {
    style.position = "sticky";
    style.left = `${header.column.getStart("left")}px`;
  } else {
    style.position = "sticky";
    style.right = `${header.column.getAfter("right")}px`;
  }

  return {
    className: cn(
      "z-30 bg-background",
      pinned === "left" && header.column.getIsLastColumn("left")
        ? "shadow-[8px_0_16px_-4px_rgba(0,0,0,0.05),_1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
      pinned === "right" && header.column.getIsFirstColumn("right")
        ? "shadow-[-8px_0_16px_-4px_rgba(0,0,0,0.05),_-1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
    ),
    style,
  };
}

function resolveCellPinStyle<TData>(cell: Cell<TData, unknown>): PinStyleState {
  const pinned = cell.column.getIsPinned();
  const style: CSSProperties = resolveColumnBaseStyle(cell.column, pinned);

  if (!pinned) return { className: undefined, style };

  if (pinned === "left") {
    style.position = "sticky";
    style.left = `${cell.column.getStart("left")}px`;
  } else {
    style.position = "sticky";
    style.right = `${cell.column.getAfter("right")}px`;
  }

  return {
    className: cn(
      "z-20 bg-background group-hover/row:bg-muted/60 transition-colors",
      pinned === "left" && cell.column.getIsLastColumn("left")
        ? "shadow-[8px_0_16px_-4px_rgba(0,0,0,0.05),_1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
      pinned === "right" && cell.column.getIsFirstColumn("right")
        ? "shadow-[-8px_0_16px_-4px_rgba(0,0,0,0.05),_-1px_0_0_0_hsl(var(--border)/0.3)]"
        : "",
    ),
    style,
  };
}

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

function shouldIgnoreRowClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, [role=button], [role=menuitem], [role=checkbox], [data-row-click-ignore=true]",
    ),
  );
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
                      className={cn(pinStyle.className, cellClassName?.(cell))}
                      style={pinStyle.style}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
