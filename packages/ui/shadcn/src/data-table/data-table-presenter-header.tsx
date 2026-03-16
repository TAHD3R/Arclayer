"use client";

import { useSortable } from "@dnd-kit/sortable";
import { flexRender, type Header, type Table as ReactTable } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

import {
  resolveHeaderAlignClass,
  resolveHeaderJustifyClass,
  resolveHeaderPinStyle,
  SortStateIcon,
} from "./data-table-presenter-utils";
import { isDataTableColumnLocked } from "./data-table-column-settings-utils";
import type { DataTableRowHeight } from "./types";

type ColumnMeta = { kind?: string };

function resolveHeaderHeightClass(rowHeight: DataTableRowHeight, wrapHeaders: boolean): string {
  if (rowHeight === "short") return wrapHeaders ? "min-h-10" : "h-10";
  if (rowHeight === "tall") return wrapHeaders ? "min-h-14" : "h-14";
  if (rowHeight === "extraTall") return wrapHeaders ? "min-h-16" : "h-16";
  return wrapHeaders ? "min-h-12" : "h-12";
}

function resolveHeaderContentClass(wrapHeaders: boolean): string {
  return wrapHeaders
    ? "whitespace-normal break-words leading-5 py-2"
    : "truncate whitespace-nowrap";
}

function isSelectColumn(meta: unknown, columnId: string): boolean {
  const kind = (meta as ColumnMeta | undefined)?.kind;
  return kind === "select" || columnId === "select";
}

function isActionsColumn(meta: unknown, columnId: string): boolean {
  const kind = (meta as ColumnMeta | undefined)?.kind;
  return kind === "actions" || columnId === "actions";
}

function isLockedLeafColumn(meta: unknown, columnId: string): boolean {
  return (
    isDataTableColumnLocked(columnId) ||
    isSelectColumn(meta, columnId) ||
    isActionsColumn(meta, columnId)
  );
}

function isLeafHeader<TData>(header: Header<TData, unknown>): boolean {
  return !header.isPlaceholder && header.colSpan === 1;
}

function toTransformStyle(
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null,
) {
  if (!transform) return undefined;
  const { x, y, scaleX, scaleY } = transform;
  return `translate3d(${x}px, ${y}px, 0) scaleX(${scaleX}) scaleY(${scaleY})`;
}

function SortableHeaderCell<TData>(props: {
  header: Header<TData, unknown>;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  dragging: { activeId: string | null; overId: string | null };
  hoveredColumnId: string | null;
  onHeaderHoverChange: (next: string | null) => void;
}) {
  const { header } = props;
  const id = header.column.id;
  const leaf = isLeafHeader(header);
  const selectColumn = isSelectColumn(header.column.columnDef.meta, id);
  const pinned = header.column.getIsPinned();
  const dragDisabled = !leaf || isDataTableColumnLocked(id);

  const sortable = useSortable({ id, disabled: dragDisabled });
  const over = props.dragging.overId === id || sortable.isOver;
  const active = props.dragging.activeId === id;
  const hovered = props.hoveredColumnId === id;

  const dndAttributes = { ...sortable.attributes, role: undefined, tabIndex: undefined };

  const alignClass = resolveHeaderAlignClass(header);
  const justifyClass = resolveHeaderJustifyClass(alignClass);
  const pinStyle = resolveHeaderPinStyle(header);

  const sortKey = String(header.column.columnDef.meta?.sortKey ?? "").trim();
  const canSort = Boolean(sortKey) && header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
  const content = header.isPlaceholder
    ? null
    : flexRender(header.column.columnDef.header, header.getContext());

  const cellTransform = toTransformStyle(sortable.transform ?? null);
  const cellStyle = {
    ...pinStyle.style,
    transform: cellTransform,
    transition: sortable.transition,
  } as CSSProperties;

  return (
    <TableHead
      ref={sortable.setNodeRef}
      key={header.id}
      aria-sort={canSort ? ariaSort : undefined}
      data-column-id={id}
      className={cn(
        alignClass,
        pinStyle.className,
        "!uppercase tracking-wider text-label-secondary select-none",
        resolveHeaderHeightClass(props.rowHeight, props.wrapHeaders),
        selectColumn ? "px-0" : "",
        over ? "bg-muted/60 ring-1 ring-ring/40 shadow-sm" : "",
        active ? "opacity-35" : "",
        hovered ? "bg-accent/25" : "",
        sortable.isDragging ? "opacity-30" : "",
        "align-middle transition-[background-color,box-shadow,opacity] duration-150",
        props.headerCellClassName?.(header),
      )}
      style={cellStyle}
      data-pinned={pinned ? String(pinned) : undefined}
      onMouseEnter={() => {
        if (!leaf) return;
        props.onHeaderHoverChange(id);
      }}
      onMouseLeave={() => {
        if (!leaf) return;
        props.onHeaderHoverChange(null);
      }}
    >
      {canSort ? (
        <div className={cn("flex h-full items-center", justifyClass)}>
          <div
            className={cn(
              "flex h-full w-full items-center max-w-full select-none",
              dragDisabled ? "opacity-80" : "cursor-grab active:cursor-grabbing",
            )}
            {...dndAttributes}
            {...sortable.listeners}
          >
            <ButtonPrimitive
              type="button"
              className={cn(
                "group inline-flex h-full items-center gap-1 rounded-sm px-1 transition-colors hover:bg-muted/50",
                justifyClass,
              )}
              style={{ textTransform: "uppercase" }}
              onClick={(e) => {
                e.stopPropagation();
                header.column.getToggleSortingHandler()?.(e);
              }}
              tapScale={1}
            >
              <div
                className={cn(
                  "min-w-0 max-w-full select-none",
                  resolveHeaderContentClass(props.wrapHeaders),
                )}
              >
                {content}
              </div>
              <SortStateIcon state={sorted} />
            </ButtonPrimitive>
          </div>
        </div>
      ) : (
        <div className={cn("flex h-full items-center", justifyClass)}>
          <div
            className={cn(
              "flex h-full w-full items-center max-w-full select-none",
              dragDisabled ? "opacity-80" : "cursor-grab active:cursor-grabbing",
            )}
            {...dndAttributes}
            {...sortable.listeners}
          >
            <div
              className={cn(
                "min-w-0 max-w-full select-none px-1",
                resolveHeaderContentClass(props.wrapHeaders),
              )}
              style={{ textTransform: "uppercase" }}
            >
              {content}
            </div>
          </div>
        </div>
      )}
    </TableHead>
  );
}

function StaticHeaderCell<TData>(props: {
  header: Header<TData, unknown>;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
}) {
  const { header } = props;
  const id = header.column.id;
  const selectColumn = isSelectColumn(header.column.columnDef.meta, id);
  const pinned = header.column.getIsPinned();
  const alignClass = resolveHeaderAlignClass(header);
  const pinStyle = resolveHeaderPinStyle(header);
  const content = header.isPlaceholder
    ? null
    : flexRender(header.column.columnDef.header, header.getContext());

  return (
    <TableHead
      key={header.id}
      data-column-id={id}
      className={cn(
        alignClass,
        pinStyle.className,
        "!uppercase tracking-wider text-label-secondary select-none align-middle",
        resolveHeaderHeightClass(props.rowHeight, props.wrapHeaders),
        selectColumn ? "px-0" : "",
        "transition-[background-color,box-shadow,opacity] duration-150",
        props.headerCellClassName?.(header),
      )}
      style={pinStyle.style}
      data-pinned={pinned ? String(pinned) : undefined}
    >
      <div className={cn("min-w-0 max-w-full", resolveHeaderContentClass(props.wrapHeaders))}>
        {content}
      </div>
    </TableHead>
  );
}

export function DataTablePresenterHeader<TData>(props: {
  table: ReactTable<TData>;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  dragging: { activeId: string | null; overId: string | null };
  hoveredColumnId: string | null;
  onHeaderHoverChange: (next: string | null) => void;
}) {
  return (
    <TableHeader>
      {props.table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="border-border/40 hover:bg-transparent">
          {headerGroup.headers.map((header) => {
            const meta = header.column.columnDef.meta;
            const columnId = header.column.id;
            const leaf = isLeafHeader(header);

            if (!leaf || isLockedLeafColumn(meta, columnId)) {
              return (
                <StaticHeaderCell
                  key={header.id}
                  header={header}
                  rowHeight={props.rowHeight}
                  wrapHeaders={props.wrapHeaders}
                  headerCellClassName={props.headerCellClassName}
                />
              );
            }

            return (
              <SortableHeaderCell
                key={header.id}
                header={header}
                rowHeight={props.rowHeight}
                wrapHeaders={props.wrapHeaders}
                headerCellClassName={props.headerCellClassName}
                dragging={props.dragging}
                hoveredColumnId={props.hoveredColumnId}
                onHeaderHoverChange={props.onHeaderHoverChange}
              />
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}
