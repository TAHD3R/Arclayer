"use client";

import { GripVertical } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useSortable } from "@dnd-kit/sortable";
import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { Switch } from "@arclayer/ui/switch";
import {
  isDataTableColumnLocked,
  resolveDataTableColumnLabel,
  type DataTableColumnMeta,
} from "./data-table-column-settings-utils";

const ICON_CLASS = "size-4";

function StaticSwitch(props: { checked: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex h-5 w-8 px-px shrink-0 items-center justify-start rounded-full border border-transparent shadow-xs opacity-70",
        props.checked ? "bg-primary justify-end" : "bg-input dark:bg-input/80 justify-start",
      )}
    >
      <div className="bg-background block size-4 rounded-full ring-0" />
    </div>
  );
}

type DataTableColumnSettingsRowViewProps<TData> = {
  table: ReactTable<TData>;
  column: ReturnType<ReactTable<TData>["getAllLeafColumns"]>[number];
  overlay?: boolean;
  dnd?: {
    setNodeRef: ReturnType<typeof useSortable>["setNodeRef"];
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    transform: ReturnType<typeof useSortable>["transform"];
    transition: ReturnType<typeof useSortable>["transition"];
    isDragging: boolean;
    isOver: boolean;
  };
};

function toTransformStyle(
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null,
) {
  if (!transform) return undefined;
  const { x, y, scaleX, scaleY } = transform;
  return `translate3d(${x}px, ${y}px, 0) scaleX(${scaleX}) scaleY(${scaleY})`;
}

function DataTableColumnSettingsRowView<TData>(props: DataTableColumnSettingsRowViewProps<TData>) {
  const meta = props.column.columnDef.meta as DataTableColumnMeta | undefined;
  const locked = isDataTableColumnLocked(props.column.id);
  const kind = meta?.kind;

  const canHide = props.column.getCanHide() && !locked && kind !== "select" && kind !== "actions";

  const label = resolveDataTableColumnLabel(props.column);
  const visible = props.column.getIsVisible();
  const over = props.dnd?.isOver ?? false;
  const dragging = props.dnd?.isDragging ?? false;
  const overlay = props.overlay === true;

  const stopDndPointerDown = React.useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const transformStyle = React.useMemo(() => {
    if (overlay) return undefined;
    if (dragging) return undefined;
    return toTransformStyle(props.dnd?.transform ?? null);
  }, [dragging, overlay, props.dnd?.transform]);

  return (
    <div
      ref={props.dnd?.setNodeRef}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2 select-none",
        "transition-[background-color,box-shadow,opacity,transform] duration-150",
        locked ? "opacity-80 cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        overlay ? "opacity-80 ring-2 ring-ring/50" : "",
        over ? "bg-muted/60 ring-1 ring-ring/40 shadow-sm" : "hover:bg-accent/25",
        dragging ? "invisible" : "",
        overlay ? "pointer-events-none" : "",
      )}
      style={{
        transform: transformStyle,
        transition: dragging ? undefined : props.dnd?.transition,
      }}
      {...props.dnd?.attributes}
      {...props.dnd?.listeners}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-7 items-center justify-center rounded-md text-label-secondary group-hover:text-foreground">
          <GripVertical className={ICON_CLASS} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-callout">{label}</div>
        </div>
      </div>

      <div className="cursor-default" onPointerDown={stopDndPointerDown}>
        {overlay ? (
          <StaticSwitch checked={visible} />
        ) : (
          <Switch
            aria-label={label}
            checked={visible}
            disabled={!canHide}
            onCheckedChange={(next) => props.column.toggleVisibility(Boolean(next))}
          />
        )}
      </div>
    </div>
  );
}

export function DataTableColumnSettingsRow<TData>(props: {
  table: ReactTable<TData>;
  column: ReturnType<ReactTable<TData>["getAllLeafColumns"]>[number];
  disabled?: boolean;
}) {
  const locked = isDataTableColumnLocked(props.column.id);
  const sortable = useSortable({ id: props.column.id, disabled: props.disabled ?? locked });

  return (
    <DataTableColumnSettingsRowView
      table={props.table}
      column={props.column}
      dnd={{
        setNodeRef: sortable.setNodeRef,
        attributes: sortable.attributes,
        listeners: sortable.listeners,
        transform: sortable.transform,
        transition: sortable.transition,
        isDragging: sortable.isDragging,
        isOver: sortable.isOver,
      }}
    />
  );
}

export function DataTableColumnSettingsRowOverlay<TData>(props: {
  table: ReactTable<TData>;
  column: ReturnType<ReactTable<TData>["getAllLeafColumns"]>[number];
}) {
  return <DataTableColumnSettingsRowView table={props.table} column={props.column} overlay />;
}
