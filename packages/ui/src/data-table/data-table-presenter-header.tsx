"use client";

import { flexRender, type Header, type Table as ReactTable } from "@tanstack/react-table";
import type { CSSProperties } from "react";

import { cn } from "@arclayer/lib/utils";
import { TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

import {
  DataTableColumnHeaderMenu,
  type DataTableColumnHeaderFilterAction,
} from "./data-table-column-header-menu";
import { DataTableColumnResizeHandle } from "./data-table-column-resize-handle";
import {
  resolveHeaderAlignClass,
  resolveHeaderPaddingClass,
  resolveHeaderJustifyClass,
  resolveHeaderPinStyle,
} from "./data-table-presenter-utils";
import { isDataTableColumnLocked } from "./data-table-column-settings-utils";
import type { DataTableColumnMenuLabels } from "./data-table-tools.types";
import type { DataTableRowHeight } from "./types";

type ColumnMeta = { kind?: string };

function resolveHeaderHeightClass(rowHeight: DataTableRowHeight, wrapHeaders: boolean): string {
  if (rowHeight === "short") return wrapHeaders ? "min-h-10" : "h-10";
  if (rowHeight === "tall") return wrapHeaders ? "min-h-[3.25rem]" : "h-[3.25rem]";
  if (rowHeight === "extraTall") return wrapHeaders ? "min-h-[3.75rem]" : "h-[3.75rem]";
  return wrapHeaders ? "min-h-[2.75rem]" : "h-[2.75rem]";
}

function resolveHeaderContentClass(wrapHeaders: boolean): string {
  return wrapHeaders ? "whitespace-normal break-words py-2" : "truncate whitespace-nowrap";
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
    contentPaddingClass: resolveHeaderPaddingClass(header.column.columnDef.meta, id),
    content: header.isPlaceholder
      ? null
      : flexRender(header.column.columnDef.header, header.getContext()),
    className: cn(
      "group/header-cell relative z-20 overflow-hidden border-r border-border/60 bg-background text-callout text-label-secondary/90 select-none align-middle font-semibold last:border-r-0",
      alignClass,
      pinStyle.className,
      resolveHeaderHeightClass(rowHeight, wrapHeaders),
      "px-0",
      "transition-[background-color,box-shadow,opacity] duration-150",
      headerCellClassName?.(header),
    ),
  };
}

function InteractiveHeaderCell<TData>(
  props: SharedHeaderCellProps<TData> & {
    wrapContent: boolean;
    onWrapContentChange: (next: boolean) => void;
    labels: DataTableColumnMenuLabels;
    resolveColumnFilterAction?: (
      header: Header<TData, unknown>,
    ) => DataTableColumnHeaderFilterAction | undefined;
  },
) {
  const leaf = isLeafHeader(props.header);
  const id = props.header.column.id;
  const state = resolveHeaderCellState(
    props.header,
    props.rowHeight,
    props.wrapHeaders,
    props.headerCellClassName,
  );
  const canWrapContent = !isActionsColumn(props.header.column.columnDef.meta, id);
  const sortKey = String(props.header.column.columnDef.meta?.sortKey ?? "").trim();
  const canSort = Boolean(sortKey) && props.header.column.getCanSort();
  const sorted = props.header.column.getIsSorted();
  const filterAction = props.resolveColumnFilterAction?.(props.header);
  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
  const cellStyle = {
    ...state.pinStyle.style,
  } as CSSProperties;

  return (
    <TableHead
      aria-sort={canSort ? ariaSort : undefined}
      data-column-id={id}
      data-pinned={props.header.column.getIsPinned() || undefined}
      className={cn(state.className, filterAction?.active ? "text-label-primary" : "")}
      style={cellStyle}
    >
      <div className={cn("flex h-full w-full items-center", state.justifyClass)}>
        <DataTableColumnHeaderMenu
          header={props.header}
          justifyClass={state.justifyClass}
          wrapHeaders={props.wrapHeaders}
          content={state.content}
          canSort={canSort}
          sorted={sorted}
          wrapContent={props.wrapContent}
          canWrapContent={canWrapContent}
          onWrapContentChange={props.onWrapContentChange}
          filterAction={filterAction}
          labels={props.labels}
          triggerClassName={cn("max-w-full items-center select-none", state.contentPaddingClass)}
        />
      </div>
      {leaf ? <DataTableColumnResizeHandle header={props.header} /> : null}
    </TableHead>
  );
}

function StaticHeaderCell<TData>(props: SharedHeaderCellProps<TData>) {
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
      className={cn(state.className, "bg-background")}
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
  wrapContent: boolean;
  onWrapContentChange: (next: boolean) => void;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  labels?: DataTableColumnMenuLabels;
  resolveColumnFilterAction?: (
    header: Header<TData, unknown>,
  ) => DataTableColumnHeaderFilterAction | undefined;
}) {
  const menuLabels = props.labels ?? {
    sort: "Sort",
    filter: "Filter",
    sortAscending: "Sort ascending",
    sortDescending: "Sort descending",
    wrapContent: "Wrap content",
    unwrapContent: "Unwrap content",
    hide: "Hide",
  };

  return (
    <TableHeader className="border-b border-border/60 bg-background [&_tr]:border-0">
      {props.table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="border-0 hover:bg-transparent">
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
              <InteractiveHeaderCell
                key={header.id}
                header={header}
                rowHeight={props.rowHeight}
                wrapHeaders={props.wrapHeaders}
                wrapContent={props.wrapContent}
                onWrapContentChange={props.onWrapContentChange}
                headerCellClassName={props.headerCellClassName}
                labels={menuLabels}
                resolveColumnFilterAction={props.resolveColumnFilterAction}
              />
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}
