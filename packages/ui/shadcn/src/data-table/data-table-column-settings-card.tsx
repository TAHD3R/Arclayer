"use client";

import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Columns3, GripVertical, RotateCcw } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import * as React from "react";
import { createPortal } from "react-dom";

import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardHeader,
  DropdownCardRoot,
  DropdownCardTrigger,
} from "@arclayer/ui/dropdown-card";

import { DataTableDefaultIconButton } from "./data-table-icon-button";
import { DataTableColumnSettingsRow } from "./data-table-column-settings-row";
import {
  DATA_TABLE_LOCKED_END_IDS,
  DATA_TABLE_LOCKED_START_IDS,
  moveDataTableColumnInUnlockedZone,
  resolveDataTableColumnLabel,
  useNormalizedDataTableColumnOrder,
} from "./data-table-column-settings-utils";
import type {
  DataTableIconButtonProps,
  DataTableToolsComponents,
  DataTableToolsLabels,
} from "./data-table-tools.types";
import { DataTableToolTooltip } from "./data-table-tool-tooltip";

const ICON_CLASS = "size-4";

function resolveIconButton(components: DataTableToolsComponents | undefined) {
  return (components?.IconButton ?? DataTableDefaultIconButton) as React.ComponentType<
    DataTableIconButtonProps & { className?: string }
  >;
}

function isLockedId(id: string): boolean {
  return DATA_TABLE_LOCKED_START_IDS.has(id) || DATA_TABLE_LOCKED_END_IDS.has(id);
}

function isLockedColumn(column: { id: string; columnDef: { meta?: unknown } }): boolean {
  if (isLockedId(column.id)) return true;
  const kind = (column.columnDef.meta as { kind?: unknown } | undefined)?.kind;
  return kind === "select" || kind === "actions";
}

export function DataTableColumnSettingsCard<TData>(props: {
  table: ReactTable<TData>;
  labels: Pick<
    DataTableToolsLabels,
    | "columns"
    | "columnsTitle"
    | "columnsDescription"
    | "reset"
    | "pinLeft"
    | "pinRight"
    | "pinNone"
    | "drag"
  >;
  components?: DataTableToolsComponents;
  onResetColumnVisibility?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const IconButton = resolveIconButton(props.components);
  const normalizedOrder = useNormalizedDataTableColumnOrder(props.table);
  const leafColumns = props.table.getAllLeafColumns();

  const orderedColumns = React.useMemo(() => {
    const idx = new Map(normalizedOrder.map((id, i) => [id, i]));
    return [...leafColumns].sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0));
  }, [leafColumns, normalizedOrder]);

  const configurableColumns = React.useMemo(() => {
    return orderedColumns.filter((col) => !isLockedColumn(col));
  }, [orderedColumns]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = React.useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      const nextOverId = e.over ? String(e.over.id) : null;
      const nextActiveId = String(e.active.id);
      setActiveId(null);
      if (!nextOverId) return;
      if (nextOverId === nextActiveId) return;
      if (isLockedId(nextActiveId) || isLockedId(nextOverId)) return;
      props.table.setColumnOrder(
        moveDataTableColumnInUnlockedZone(normalizedOrder, nextActiveId, nextOverId),
      );
    },
    [normalizedOrder, props.table],
  );

  const onDragCancel = React.useCallback(() => {
    setActiveId(null);
  }, [normalizedOrder]);

  const resetAll = React.useCallback(() => {
    if (props.onResetColumnVisibility) props.onResetColumnVisibility();
    else props.table.resetColumnVisibility();
    props.table.resetColumnPinning();
    props.table.resetColumnOrder();
  }, [normalizedOrder, props.onResetColumnVisibility, props.table]);

  const activeLabel = React.useMemo(() => {
    if (!activeId) return null;
    const col = leafColumns.find((c) => c.id === activeId);
    return col ? resolveDataTableColumnLabel(col) : activeId;
  }, [activeId, leafColumns]);

  return (
    <DropdownCardRoot open={open} onOpenChange={setOpen}>
      <DropdownCardTrigger asChild>
        <span className="inline-flex">
          <DataTableToolTooltip label={props.labels.columns}>
            <IconButton label={props.labels.columns}>
              <Columns3 className={ICON_CLASS} />
            </IconButton>
          </DataTableToolTooltip>
        </span>
      </DropdownCardTrigger>

      <DropdownCardContent align="end" sideOffset={8} className="w-[560px] max-w-[90vw]">
        <DropdownCardHeader className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">{props.labels.columnsTitle}</div>
            <div className="text-footnote text-label-secondary">
              {props.labels.columnsDescription}
            </div>
          </div>

          <DataTableToolTooltip label={props.labels.reset}>
            <DataTableDefaultIconButton label={props.labels.reset} onClick={resetAll}>
              <RotateCcw className={ICON_CLASS} />
            </DataTableDefaultIconButton>
          </DataTableToolTooltip>
        </DropdownCardHeader>

        <DropdownCardBody className="py-3">
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext
              items={configurableColumns.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-2">
                {configurableColumns.map((column) => (
                  <DataTableColumnSettingsRow
                    key={column.id}
                    table={props.table}
                    column={column}
                    labels={props.labels}
                  />
                ))}
              </div>
            </SortableContext>

            {typeof document === "undefined"
              ? null
              : createPortal(
                  <DragOverlay
                    adjustScale={false}
                    zIndex={80}
                    dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}
                  >
                    {activeLabel ? (
                      <div className="rounded-xl border bg-background/92 px-3 py-2 shadow-2xl ring-2 ring-ring/30">
                        <div className="flex items-center gap-3">
                          <div className="flex size-7 items-center justify-center rounded-md bg-accent/40 text-label-secondary">
                            <GripVertical className={ICON_CLASS} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-footnote font-medium">{activeLabel}</div>
                          </div>
                          <div className="h-5 w-8 rounded-full bg-muted/50" />
                        </div>
                      </div>
                    ) : null}
                  </DragOverlay>,
                  document.body,
                )}
          </DndContext>
        </DropdownCardBody>
      </DropdownCardContent>
    </DropdownCardRoot>
  );
}
