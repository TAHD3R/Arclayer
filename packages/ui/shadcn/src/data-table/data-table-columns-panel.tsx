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
import { RotateCcw, Search, Settings2 } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import * as React from "react";
import { createPortal } from "react-dom";

import { Input } from "@arclayer/ui/input";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardHeader,
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
    | "pinLeft"
    | "pinRight"
    | "pinNone"
    | "drag"
    | "reset"
  >;
  components?: DataTableToolsComponents;
  onResetColumnVisibility?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
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

  const filteredColumns = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return columns;
    return columns.filter((column) => {
      const title = String(column.columnDef.meta?.title ?? column.id).toLowerCase();
      return title.includes(needle);
    });
  }, [columns, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
  );

  const handleReset = React.useCallback(() => {
    if (props.onResetColumnVisibility) props.onResetColumnVisibility();
    else props.table.resetColumnVisibility();
    props.table.resetColumnOrder();
    props.table.resetColumnPinning();
  }, [props]);

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

      <DropdownCardContent align="end" sideOffset={8} className="w-[380px] max-w-[92vw]">
        <DropdownCardHeader className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-headline">{props.labels.columnsTitle}</div>
            <div className="text-callout text-label-secondary">
              {props.labels.columnsDescription}
            </div>
          </div>

          <DataTableToolTooltip label={props.labels.reset}>
            <DataTableDefaultIconButton label={props.labels.reset} onClick={handleReset}>
              <RotateCcw className={ICON_CLASS} />
            </DataTableDefaultIconButton>
          </DataTableToolTooltip>
        </DropdownCardHeader>

        <DropdownCardBody className="space-y-3 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-secondary" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={props.labels.columnsSearchPlaceholder}
              className="pl-9"
            />
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext
              items={filteredColumns.map((column) => column.id)}
              strategy={verticalListSortingStrategy}
            >
              <ScrollArea className="max-h-[320px]">
                {filteredColumns.length ? (
                  <div className="grid w-full grid-cols-1 gap-2 pr-1">
                    {filteredColumns.map((column) => (
                      <DataTableColumnSettingsRow
                        key={column.id}
                        table={props.table}
                        column={column}
                        labels={props.labels}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-center text-footnote text-label-secondary">
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
                        labels={props.labels}
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
