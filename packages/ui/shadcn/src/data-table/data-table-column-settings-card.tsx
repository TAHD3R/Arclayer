"use client";

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Columns3, RotateCcw } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import * as React from "react";

import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardFooter,
  DropdownCardHeader,
  DropdownCardRoot,
  DropdownCardTrigger,
} from "@celestial/ui/dropdown-card";

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

function useDraftColumnOrder<TData>(table: ReactTable<TData>, open: boolean) {
  const normalizedOrder = useNormalizedDataTableColumnOrder(table);
  const leafColumns = table.getAllLeafColumns();

  const [draftOrder, setDraftOrder] = React.useState<string[]>(() => normalizedOrder);

  React.useEffect(() => {
    if (!open) return;
    setDraftOrder(normalizedOrder);
  }, [open, normalizedOrder]);

  const orderedColumns = React.useMemo(() => {
    const idx = new Map(draftOrder.map((id, i) => [id, i]));
    return [...leafColumns].sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0));
  }, [draftOrder, leafColumns]);

  return { leafColumns, normalizedOrder, draftOrder, setDraftOrder, orderedColumns } as const;
}

export function DataTableColumnSettingsCard<TData>(props: {
  table: ReactTable<TData>;
  labels: Pick<
    DataTableToolsLabels,
    | "columns"
    | "columnsTitle"
    | "columnsDescription"
    | "columnsLockedHint"
    | "reset"
    | "pinLeft"
    | "pinRight"
    | "pinNone"
    | "moveUp"
    | "moveDown"
    | "confirm"
    | "drag"
  >;
  components?: DataTableToolsComponents;
  onResetColumnVisibility?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const IconButton = resolveIconButton(props.components);
  const { leafColumns, normalizedOrder, draftOrder, setDraftOrder, orderedColumns } =
    useDraftColumnOrder(props.table, open);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = React.useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const onDragOver = React.useCallback((e: DragOverEvent) => {
    const nextOverId = e.over ? String(e.over.id) : null;
    setOverId(nextOverId);
    if (!nextOverId) return;

    const nextActiveId = String(e.active.id);
    if (nextActiveId === nextOverId) return;
    if (isLockedId(nextActiveId) || isLockedId(nextOverId)) return;

    setDraftOrder((prev) => {
      if (!prev.includes(nextActiveId) || !prev.includes(nextOverId)) return prev;
      return moveDataTableColumnInUnlockedZone(prev, nextActiveId, nextOverId);
    });
  }, []);

  const onDragEnd = React.useCallback(
    (e: DragEndEvent) => {
      const nextOverId = e.over ? String(e.over.id) : null;
      const nextActiveId = String(e.active.id);
      setActiveId(null);
      setOverId(null);
      if (!nextOverId) return;
      if (nextOverId === nextActiveId) return;
      props.table.setColumnOrder(draftOrder);
    },
    [draftOrder, props.table],
  );

  const onDragCancel = React.useCallback(() => {
    setActiveId(null);
    setOverId(null);
    setDraftOrder(normalizedOrder);
  }, [normalizedOrder]);

  const resetAll = React.useCallback(() => {
    if (props.onResetColumnVisibility) props.onResetColumnVisibility();
    else props.table.resetColumnVisibility();
    props.table.resetColumnPinning();
    props.table.resetColumnOrder();
    setDraftOrder(normalizedOrder);
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
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <div className="grid grid-cols-1 gap-2">
              {orderedColumns.map((column) => (
                <DataTableColumnSettingsRow
                  key={column.id}
                  table={props.table}
                  order={draftOrder}
                  column={column}
                  labels={props.labels}
                  overId={overId}
                />
              ))}
            </div>

            <DragOverlay>
              {activeLabel ? (
                <div className="rounded-xl border bg-background px-3 py-2 shadow-xl">
                  <div className="text-footnote font-medium">{activeLabel}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </DropdownCardBody>

        <DropdownCardFooter className="flex items-center justify-between">
          <div className="text-footnote text-label-secondary">{props.labels.columnsLockedHint}</div>
          <button
            type="button"
            className="text-footnote font-medium text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            {props.labels.confirm}
          </button>
        </DropdownCardFooter>
      </DropdownCardContent>
    </DropdownCardRoot>
  );
}
