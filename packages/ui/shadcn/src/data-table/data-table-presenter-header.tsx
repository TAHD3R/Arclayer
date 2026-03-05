"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { flexRender, type Header, type Table as ReactTable } from "@tanstack/react-table";
import { GripVertical } from "lucide-react";
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

const ICON_CLASS = "size-4";
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

function HeaderDragHandle(props: { id: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.id,
    disabled: props.disabled,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={props.id}
      className={cn(
        "ml-1 inline-flex size-6 items-center justify-center rounded-md text-label-secondary",
        "hover:bg-muted/60 hover:text-foreground",
        props.disabled ? "opacity-40 cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        isDragging ? "bg-muted/60 text-foreground" : "",
      )}
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className={ICON_CLASS} />
    </button>
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
        "uppercase tracking-wider text-label-secondary",
        resolveHeaderDensityClass(props.density),
        selectColumn ? "px-0" : "",
        over ? "bg-muted/60 ring-1 ring-ring/40" : "",
        props.headerCellClassName?.(header),
      )}
      style={pinStyle.style}
      data-pinned={pinned ? String(pinned) : undefined}
    >
      {canSort ? (
        <div className={cn("inline-flex items-center", justifyClass)}>
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
          <HeaderDragHandle id={id} disabled={dragDisabled} />
        </div>
      ) : (
        <div className={cn("inline-flex items-center", justifyClass)}>
          {content}
          {leaf ? <HeaderDragHandle id={id} disabled={dragDisabled} /> : null}
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
