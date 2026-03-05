"use client";

import { AlignLeft, AlignRight, ArrowDown, ArrowUp, GripVertical, PinOff } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useDraggable, useDroppable } from "@dnd-kit/core";

import { cn } from "@celestial/lib/utils";
import { Checkbox } from "@celestial/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@celestial/ui/tooltip";

import { DataTableDefaultIconButton } from "./data-table-icon-button";
import type { DataTableToolsLabels } from "./data-table-tools.types";
import {
  DATA_TABLE_LOCKED_END_IDS,
  DATA_TABLE_LOCKED_START_IDS,
  isDataTableColumnLocked,
  resolveDataTableColumnLabel,
  type DataTableColumnMeta,
} from "./data-table-column-settings-utils";

const ICON_CLASS = "size-4";

function ColumnDragHandle(props: { id: string; disabled: boolean; ariaLabel: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.id,
    disabled: props.disabled,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-label-secondary hover:bg-accent hover:text-foreground",
            props.disabled ? "opacity-40 cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
            isDragging ? "bg-accent text-foreground" : "",
          )}
          aria-label={props.ariaLabel}
          {...attributes}
          {...listeners}
        >
          <GripVertical className={ICON_CLASS} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{props.ariaLabel}</TooltipContent>
    </Tooltip>
  );
}

function ColumnRowActions(props: {
  table: ReactTable<unknown>;
  columnId: string;
  pinned: ReturnType<ReactTable<unknown>["getAllLeafColumns"]>[number]["getIsPinned"];
  canPin: boolean;
  order: readonly string[];
  labels: Pick<DataTableToolsLabels, "pinLeft" | "pinRight" | "pinNone" | "moveUp" | "moveDown">;
  locked: boolean;
}) {
  const pinned = props.pinned();
  const idx = props.order.indexOf(props.columnId);
  const canMoveUp =
    !props.locked && idx > 0 && !DATA_TABLE_LOCKED_START_IDS.has(props.order[idx - 1] ?? "");
  const canMoveDown =
    !props.locked &&
    idx >= 0 &&
    idx < props.order.length - 1 &&
    !DATA_TABLE_LOCKED_END_IDS.has(props.order[idx + 1] ?? "");

  const moveTo = (to: number) => {
    if (idx < 0) return;
    if (to === idx) return;
    const next = [...props.order];
    const [picked] = next.splice(idx, 1);
    next.splice(to, 0, picked);
    props.table.setColumnOrder(next);
  };

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <DataTableDefaultIconButton
            label={props.labels.moveUp}
            disabled={!canMoveUp}
            onClick={() => moveTo(Math.max(0, idx - 1))}
          >
            <ArrowUp className={ICON_CLASS} />
          </DataTableDefaultIconButton>
        </TooltipTrigger>
        <TooltipContent>{props.labels.moveUp}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <DataTableDefaultIconButton
            label={props.labels.moveDown}
            disabled={!canMoveDown}
            onClick={() => moveTo(Math.min(props.order.length - 1, idx + 1))}
          >
            <ArrowDown className={ICON_CLASS} />
          </DataTableDefaultIconButton>
        </TooltipTrigger>
        <TooltipContent>{props.labels.moveDown}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <DataTableDefaultIconButton
            label={props.labels.pinLeft}
            disabled={!props.canPin || pinned === "left"}
            onClick={() => props.table.getColumn(props.columnId)?.pin("left")}
          >
            <AlignLeft className={ICON_CLASS} />
          </DataTableDefaultIconButton>
        </TooltipTrigger>
        <TooltipContent>{props.labels.pinLeft}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <DataTableDefaultIconButton
            label={props.labels.pinRight}
            disabled={!props.canPin || pinned === "right"}
            onClick={() => props.table.getColumn(props.columnId)?.pin("right")}
          >
            <AlignRight className={ICON_CLASS} />
          </DataTableDefaultIconButton>
        </TooltipTrigger>
        <TooltipContent>{props.labels.pinRight}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <DataTableDefaultIconButton
            label={props.labels.pinNone}
            disabled={!props.canPin || pinned === false}
            onClick={() => props.table.getColumn(props.columnId)?.pin(false)}
          >
            <PinOff className={ICON_CLASS} />
          </DataTableDefaultIconButton>
        </TooltipTrigger>
        <TooltipContent>{props.labels.pinNone}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function DataTableColumnSettingsRow<TData>(props: {
  table: ReactTable<TData>;
  order: readonly string[];
  column: ReturnType<ReactTable<TData>["getAllLeafColumns"]>[number];
  labels: Pick<
    DataTableToolsLabels,
    "pinLeft" | "pinRight" | "pinNone" | "moveUp" | "moveDown" | "drag"
  >;
  overId: string | null;
}) {
  const meta = props.column.columnDef.meta as DataTableColumnMeta | undefined;
  const locked = isDataTableColumnLocked(props.column.id);
  const kind = meta?.kind;

  const canHide = props.column.getCanHide() && !locked && kind !== "select" && kind !== "actions";

  const label = resolveDataTableColumnLabel(props.column);
  const canPin = props.column.getCanPin() && !locked;

  const { setNodeRef, isOver } = useDroppable({ id: props.column.id, disabled: locked });
  const highlighted = Boolean(isOver || props.overId === props.column.id);

  return (
    <TooltipProvider>
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors",
          highlighted ? "border-ring bg-accent/30" : "border-border/60 bg-background",
          locked ? "opacity-70" : "",
        )}
      >
        <ColumnDragHandle id={props.column.id} disabled={locked} ariaLabel={props.labels.drag} />

        <Checkbox
          aria-label={label}
          checked={props.column.getIsVisible()}
          disabled={!canHide}
          onCheckedChange={(next) => props.column.toggleVisibility(Boolean(next))}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote font-medium">{label}</div>
          <div className="text-caption text-label-secondary">{props.column.id}</div>
        </div>

        <ColumnRowActions
          table={props.table as unknown as ReactTable<unknown>}
          columnId={props.column.id}
          pinned={() => props.column.getIsPinned()}
          canPin={canPin}
          order={props.order}
          labels={props.labels}
          locked={locked}
        />
      </div>
    </TooltipProvider>
  );
}
