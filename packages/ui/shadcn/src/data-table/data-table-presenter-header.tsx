"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { flexRender, type Header, type Table as ReactTable } from "@tanstack/react-table";
import * as React from "react";

import { cn } from "@celestial/lib/utils";
import { TableHead, TableHeader, TableRow } from "@celestial/ui/table";

import {
  resolveHeaderAlignClass,
  resolveHeaderJustifyClass,
  resolveHeaderPinStyle,
  SortStateIcon,
} from "./data-table-presenter-utils";
import { isDataTableColumnLocked } from "./data-table-column-settings-utils";
import type { DataTableDensity } from "./types";

type ColumnMeta = { kind?: string };

function resolveHeaderDensityClass(density: DataTableDensity): string {
  if (density === "compact") return "h-10";
  if (density === "relaxed") return "h-14";
  return "";
}

function isSelectColumn(meta: unknown, columnId: string): boolean {
  const kind = (meta as ColumnMeta | undefined)?.kind;
  return kind === "select" || columnId === "select";
}

function isLeafHeader<TData>(header: Header<TData, unknown>): boolean {
  return !header.isPlaceholder && header.colSpan === 1;
}

function HeaderDraggableBlock(props: {
  headerId: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: props.headerId,
    disabled: props.disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-full items-center max-w-full select-none",
        props.disabled ? "opacity-80" : "cursor-grab active:cursor-grabbing",
        isDragging ? "bg-muted/60 rounded-sm" : "",
      )}
      {...listeners}
    >
      {props.children}
    </div>
  );
}

function HeaderDroppableCell<TData>(props: {
  header: Header<TData, unknown>;
  density: DataTableDensity;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  dragging: { overId: string | null };
}) {
  const { header } = props;
  const id = header.column.id;
  const leaf = isLeafHeader(header);
  const selectColumn = isSelectColumn(header.column.columnDef.meta, id);
  const pinned = header.column.getIsPinned();
  const dragDisabled = !leaf || isDataTableColumnLocked(id);

  const { setNodeRef, isOver } = useDroppable({ id, disabled: dragDisabled });
  const over = props.dragging.overId === id || isOver;

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

  return (
    <TableHead
      ref={setNodeRef}
      key={header.id}
      aria-sort={canSort ? ariaSort : undefined}
      className={cn(
        alignClass,
        pinStyle.className,
        "uppercase tracking-wider text-label-secondary select-none",
        resolveHeaderDensityClass(props.density),
        selectColumn ? "px-0" : "",
        over ? "bg-muted/60 ring-1 ring-ring/40" : "",
        props.headerCellClassName?.(header),
      )}
      style={pinStyle.style}
      data-pinned={pinned ? String(pinned) : undefined}
    >
      {canSort ? (
        <div className={cn("flex h-full items-center", justifyClass)}>
          <HeaderDraggableBlock headerId={id} disabled={dragDisabled}>
            <button
              type="button"
              className={cn(
                "group inline-flex items-center gap-1 rounded-sm px-1 py-1 transition-colors hover:bg-muted/50",
                justifyClass,
              )}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                header.column.getToggleSortingHandler()?.(e);
              }}
            >
              <span className="truncate select-none">{content}</span>
              <SortStateIcon state={sorted} />
            </button>
          </HeaderDraggableBlock>
        </div>
      ) : (
        <div className={cn("flex h-full items-center", justifyClass)}>
          <HeaderDraggableBlock headerId={id} disabled={dragDisabled}>
            <span className="truncate select-none px-1 py-1">{content}</span>
          </HeaderDraggableBlock>
        </div>
      )}
    </TableHead>
  );
}

export function DataTablePresenterHeader<TData>(props: {
  table: ReactTable<TData>;
  density: DataTableDensity;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  dragging: { overId: string | null };
}) {
  return (
    <TableHeader>
      {props.table.getHeaderGroups().map((headerGroup) => (
        <TableRow key={headerGroup.id} className="border-border/40 hover:bg-transparent">
          {headerGroup.headers.map((header) => (
            <HeaderDroppableCell
              key={header.id}
              header={header}
              density={props.density}
              headerCellClassName={props.headerCellClassName}
              dragging={props.dragging}
            />
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}
