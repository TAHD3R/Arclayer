"use client";

import { Eye, EyeOff, GripVertical } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useSortable } from "@dnd-kit/sortable";
import * as React from "react";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  isDataTableColumnLocked,
  resolveDataTableColumnLabel,
  type DataTableColumnMeta,
} from "./data-table-column-settings-utils";

const ICON_CLASS = "size-4";
const VISIBILITY_ICON_CLASS = "size-4";

function VisibilityToggle(props: {
  visible: boolean;
  label: string;
  disabled?: boolean;
  overlay?: boolean;
  onToggle?: () => void;
}) {
  const icon = props.visible ? (
    <Eye className={VISIBILITY_ICON_CLASS} />
  ) : (
    <EyeOff className={VISIBILITY_ICON_CLASS} />
  );

  if (props.overlay) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex size-7 items-center justify-center rounded-md border border-border/50 bg-background/70",
          props.visible ? "text-foreground" : "text-label-secondary",
        )}
      >
        {icon}
      </div>
    );
  }

  return (
    <ButtonPrimitive
      type="button"
      aria-label={props.label}
      aria-pressed={props.visible}
      disabled={props.disabled}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors",
        props.visible
          ? "border-border/60 bg-accent/20 text-foreground"
          : "border-transparent text-label-secondary hover:border-border/50 hover:bg-accent/12 hover:text-foreground",
        props.disabled ? "pointer-events-none opacity-35" : "",
      )}
      onClick={props.onToggle}
    >
      {icon}
    </ButtonPrimitive>
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
        "group/column-settings-row flex items-center gap-2.5 rounded-sm border border-transparent px-2 py-1.5 select-none",
        "transition-[background-color,box-shadow,opacity,transform] duration-150",
        locked ? "opacity-80 cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        overlay ? "border-border/60 bg-popover/95 opacity-92 shadow-2xl" : "",
        over
          ? "border-border/70 bg-accent/18 shadow-[0_14px_32px_-22px_rgba(0,0,0,0.65)]"
          : "hover:bg-accent/12",
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
        <div className="flex size-4 items-center justify-center text-label-secondary transition-colors group-hover/column-settings-row:text-foreground/80">
          <GripVertical className={ICON_CLASS} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote font-medium">{label}</div>
        </div>
      </div>

      <div className="cursor-default" onPointerDown={stopDndPointerDown}>
        <VisibilityToggle
          label={label}
          visible={visible}
          disabled={!canHide}
          overlay={overlay}
          onToggle={() => props.column.toggleVisibility(!visible)}
        />
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
