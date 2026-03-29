"use client";

import { useSortable } from "@dnd-kit/sortable";
import { flexRender, type Header, type Table as ReactTable } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import { cn } from "@arclayer/lib/utils";
import { TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

import { DataTableColumnHeaderMenu } from "./data-table-column-header-menu";
import { DataTableColumnResizeHandle } from "./data-table-column-resize-handle";
import {
  resolveHeaderAlignClass,
  resolveHeaderPaddingClass,
  resolveHeaderJustifyClass,
  resolveHeaderPinStyle,
} from "./data-table-presenter-utils";
import { isDataTableColumnLocked } from "./data-table-column-settings-utils";
import type { DataTableToolsLabels } from "./data-table-tools.types";
import type { DataTableRowHeight } from "./types";

type ColumnMeta = { kind?: string };

function resolveHeaderHeightClass(rowHeight: DataTableRowHeight, wrapHeaders: boolean): string {
  if (rowHeight === "short") return wrapHeaders ? "min-h-10" : "h-10";
  if (rowHeight === "tall") return wrapHeaders ? "min-h-[3.375rem]" : "h-[3.375rem]";
  if (rowHeight === "extraTall") return wrapHeaders ? "min-h-16" : "h-16";
  return wrapHeaders ? "min-h-[2.875rem]" : "h-[2.875rem]";
}

function resolveHeaderContentClass(wrapHeaders: boolean): string {
  return wrapHeaders ? "whitespace-normal break-words  py-2" : "truncate whitespace-nowrap";
}

function isSelectColumn(meta: unknown, columnId: string): boolean {
  const kind = (meta as ColumnMeta | undefined)?.kind;
  return kind === "select" || columnId === "select";
}

function isActionsColumn(meta: unknown, columnId: string): boolean {
  const kind = (meta as ColumnMeta | undefined)?.kind;
  return kind === "actions" || columnId === "actions";
}

function resolveLockedColumnInnerPaddingClass(meta: unknown, columnId: string): string {
  if (isSelectColumn(meta, columnId) || isActionsColumn(meta, columnId)) {
    return "px-0";
  }
  return "px-1";
}

function resolveLockedColumnContentPaddingClass(meta: unknown, columnId: string): string {
  if (isSelectColumn(meta, columnId) || isActionsColumn(meta, columnId)) {
    return "w-full px-0";
  }
  return "px-2";
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

type SharedHeaderCellProps<TData> = {
  header: Header<TData, unknown>;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
};

function resolveHeaderCellState<TData>(
  header: Header<TData, unknown>,
  rowHeight: DataTableRowHeight,
  wrapHeaders: boolean,
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined,
) {
  const id = header.column.id;
  const alignClass = resolveHeaderAlignClass(header);
  const justifyClass = resolveHeaderJustifyClass(alignClass);
  const pinStyle = resolveHeaderPinStyle(header);

  return {
    id,
    alignClass,
    justifyClass,
    pinStyle,
    content: header.isPlaceholder
      ? null
      : flexRender(header.column.columnDef.header, header.getContext()),
    className: cn(
      "group/header-cell relative border-b border-border/60 bg-transparent text-callout text-label-secondary/90 select-none align-middle font-medium",
      alignClass,
      pinStyle.className,
      resolveHeaderHeightClass(rowHeight, wrapHeaders),
      resolveHeaderPaddingClass(header.column.columnDef.meta, id),
      "transition-[background-color,box-shadow,opacity] duration-150",
      headerCellClassName?.(header),
    ),
  };
}

function SortableHeaderCell<TData>(
  props: SharedHeaderCellProps<TData> & {
    dragging: { activeId: string | null; overId: string | null };
    labels: Pick<DataTableToolsLabels, "sortAscending" | "sortDescending" | "hideColumn">;
  },
) {
  const leaf = isLeafHeader(props.header);
  const id = props.header.column.id;
  const dragDisabled = !leaf || isDataTableColumnLocked(id);
  const sortable = useSortable({ id, disabled: dragDisabled });
  const over = props.dragging.overId === id || sortable.isOver;
  const active = props.dragging.activeId === id;
  const state = resolveHeaderCellState(
    props.header,
    props.rowHeight,
    props.wrapHeaders,
    props.headerCellClassName,
  );
  const dndAttributes = { ...sortable.attributes, role: undefined, tabIndex: undefined };
  const sortKey = String(props.header.column.columnDef.meta?.sortKey ?? "").trim();
  const canSort = Boolean(sortKey) && props.header.column.getCanSort();
  const sorted = props.header.column.getIsSorted();
  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
  const cellStyle = {
    ...state.pinStyle.style,
    transform: toTransformStyle(sortable.transform ?? null),
    transition: sortable.transition,
  } as CSSProperties;

  return (
    <TableHead
      ref={sortable.setNodeRef}
      aria-sort={canSort ? ariaSort : undefined}
      data-column-id={id}
      data-pinned={props.header.column.getIsPinned() || undefined}
      className={cn(
        state.className,
        over ? "bg-muted/60 ring-1 ring-ring/40 " : "",
        active ? "opacity-35" : "",
        sortable.isDragging ? "opacity-30" : "",
      )}
      style={cellStyle}
    >
      <div className={cn("flex h-full w-full items-center", state.justifyClass)}>
        <div
          className={cn(
            "flex h-full w-full max-w-full items-center select-none",
            dragDisabled ? "opacity-80" : "cursor-grab active:cursor-grabbing",
          )}
          {...dndAttributes}
          {...sortable.listeners}
        >
          <DataTableColumnHeaderMenu
            header={props.header}
            justifyClass={state.justifyClass}
            wrapHeaders={props.wrapHeaders}
            content={state.content}
            canSort={canSort}
            sorted={sorted}
            labels={props.labels}
          />
        </div>
      </div>
      {leaf ? <DataTableColumnResizeHandle header={props.header} /> : null}
    </TableHead>
  );
}

function StaticHeaderCell<TData>(
  props: SharedHeaderCellProps<TData> & {
    labels: Pick<DataTableToolsLabels, "sortAscending" | "sortDescending" | "hideColumn">;
  },
) {
  const state = resolveHeaderCellState(
    props.header,
    props.rowHeight,
    props.wrapHeaders,
    props.headerCellClassName,
  );

  const columnMeta = props.header.column.columnDef.meta;
  const columnId = props.header.column.id;

  return (
    <TableHead
      data-column-id={state.id}
      data-pinned={props.header.column.getIsPinned() || undefined}
      className={state.className}
      style={state.pinStyle.style}
    >
      <div className={cn("flex h-full w-full items-center", state.justifyClass)}>
        <div
          className={cn(
            "flex h-full w-full max-w-full items-center select-none opacity-80",
            resolveLockedColumnInnerPaddingClass(columnMeta, columnId),
          )}
        >
          <div
            className={cn(
              "inline-flex min-h-8 max-w-full items-center py-1.5",
              state.justifyClass,
              resolveLockedColumnContentPaddingClass(columnMeta, columnId),
              resolveHeaderContentClass(props.wrapHeaders),
            )}
          >
            {state.content}
          </div>
        </div>
      </div>
      {isLeafHeader(props.header) ? <DataTableColumnResizeHandle header={props.header} /> : null}
    </TableHead>
  );
}

export function DataTablePresenterHeader<TData>(props: {
  table: ReactTable<TData>;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  dragging: { activeId: string | null; overId: string | null };
  labels?: Pick<DataTableToolsLabels, "sortAscending" | "sortDescending" | "hideColumn">;
}) {
  const menuLabels = props.labels ?? {
    sortAscending: "Sort ascending",
    sortDescending: "Sort descending",
    hideColumn: "Hide column",
  };

  return (
    <TableHeader>
      {props.table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="border-border/50 hover:bg-transparent">
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
                  labels={menuLabels}
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
                labels={menuLabels}
              />
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}
