"use client";

import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Settings2 } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import * as React from "react";
import { createPortal } from "react-dom";

import { ScrollArea } from "@arclayer/ui/scroll-area";
import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardRoot,
  DropdownCardTrigger,
} from "@arclayer/ui/dropdown-card";

import { DataTableDefaultIconButton } from "./data-table-icon-button";
import {
  DataTableColumnSettingsRow,
  DataTableColumnSettingsRowOverlay,
} from "./data-table-column-settings-row";
import {
  moveDataTableColumnInUnlockedZone,
  useNormalizedDataTableColumnOrder,
} from "./data-table-column-settings-utils";
import { DataTableToolTooltip } from "./data-table-tool-tooltip";
import type {
  DataTableIconButtonProps,
  DataTableToolsComponents,
  DataTableToolsLabels,
} from "./data-table-tools.types";

const ICON_CLASS = "size-4";
const DRAG_DISTANCE_PX = 6;

function resolveIconButton(components: DataTableToolsComponents | undefined) {
  return (components?.IconButton ?? DataTableDefaultIconButton) as React.ComponentType<
    DataTableIconButtonProps & { className?: string }
  >;
}

function isConfigurableColumn(column: {
  id: string;
  getCanHide: () => boolean;
  columnDef: { meta?: unknown };
}) {
  const kind = (column.columnDef.meta as { kind?: string } | undefined)?.kind;
  if (kind === "select" || kind === "actions") return false;
  return column.getCanHide();
}

export function DataTableColumnsPanel<TData>(props: {
  table: ReactTable<TData>;
  labels: Pick<
    DataTableToolsLabels,
    | "columns"
    | "columnsTitle"
    | "columnsDescription"
    | "columnsSearchPlaceholder"
    | "columnsEmpty"
    | "reset"
  >;
  components?: DataTableToolsComponents;
  onResetColumnVisibility?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const IconButton = resolveIconButton(props.components);
  const normalizedOrder = useNormalizedDataTableColumnOrder(props.table);

  const orderedColumns = React.useMemo(() => {
    const indexMap = new Map(normalizedOrder.map((id, index) => [id, index]));
    return [...props.table.getAllLeafColumns()].sort(
      (a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0),
    );
  }, [normalizedOrder, props.table]);

  const columns = React.useMemo(
    () => orderedColumns.filter((column) => isConfigurableColumn(column)),
    [orderedColumns],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
  );

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const active = String(event.active.id);
      const over = event.over ? String(event.over.id) : null;
      setActiveId(null);
      if (!over || over === active) return;
      props.table.setColumnOrder(moveDataTableColumnInUnlockedZone(normalizedOrder, active, over));
    },
    [normalizedOrder, props.table],
  );

  const activeColumn = React.useMemo(
    () => columns.find((column) => column.id === activeId) ?? null,
    [activeId, columns],
  );

  return (
    <DropdownCardRoot open={open} onOpenChange={setOpen}>
      <DropdownCardTrigger asChild>
        <span className="inline-flex">
          <DataTableToolTooltip label={props.labels.columns}>
            <IconButton label={props.labels.columns} active={open}>
              <Settings2 className={ICON_CLASS} />
            </IconButton>
          </DataTableToolTooltip>
        </span>
      </DropdownCardTrigger>

      <DropdownCardContent
        align="end"
        sideOffset={8}
        className="w-[240px] max-w-[80vw] rounded-md border p-1 shadow-md"
      >
        <DropdownCardBody className="px-0 py-0 ">
          <div className="w-full border-b">
            <div className="px-2 py-1.5 text-headline text-label-secondary">
              {props.labels.columnsTitle}
            </div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext
              items={columns.map((column) => column.id)}
              strategy={verticalListSortingStrategy}
            >
              <ScrollArea className="max-h-[320px]">
                {columns.length ? (
                  <div className="grid w-full grid-cols-1 gap-0.5">
                    {columns.map((column) => (
                      <DataTableColumnSettingsRow
                        key={column.id}
                        table={props.table}
                        column={column}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-3 text-center text-callout text-label-secondary">
                    {props.labels.columnsEmpty}
                  </div>
                )}
              </ScrollArea>
            </SortableContext>

            {typeof document === "undefined"
              ? null
              : createPortal(
                  <DragOverlay
                    adjustScale={false}
                    zIndex={80}
                    dropAnimation={{
                      duration: 180,
                      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                    }}
                  >
                    {activeColumn ? (
                      <DataTableColumnSettingsRowOverlay
                        table={props.table}
                        column={activeColumn}
                      />
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
