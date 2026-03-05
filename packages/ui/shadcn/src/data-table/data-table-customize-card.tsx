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
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import * as React from "react";

import {
  DropdownCardBody,
  DropdownCardContent,
  DropdownCardHeader,
  DropdownCardRoot,
  DropdownCardTrigger,
} from "@celestial/ui/dropdown-card";

import { DataTableDefaultIconButton } from "./data-table-icon-button";
import {
  DataTableColumnSettingsRow,
  DataTableColumnSettingsRowOverlay,
} from "./data-table-column-settings-row";
import {
  DATA_TABLE_LOCKED_END_IDS,
  DATA_TABLE_LOCKED_START_IDS,
  moveDataTableColumnInUnlockedZone,
  resolveDataTableColumnLabel,
  useNormalizedDataTableColumnOrder,
} from "./data-table-column-settings-utils";
import {
  DataTableDensityDiagram,
  DataTableDensityOptionButton,
} from "./data-table-customize-density";
import { DataTableToolTooltip } from "./data-table-tool-tooltip";
import type {
  DataTableIconButtonProps,
  DataTableToolsComponents,
  DataTableToolsLabels,
} from "./data-table-tools.types";
import type { DataTableDensity } from "./types";

const ICON_CLASS = "size-4";
const DRAG_DISTANCE_PX = 6;

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

function clampDensity(value: DataTableDensity): DataTableDensity {
  if (value === "compact") return "compact";
  if (value === "relaxed") return "relaxed";
  return "default";
}

export function DataTableCustomizeCard<TData>(props: {
  table: ReactTable<TData>;
  density: DataTableDensity;
  onDensityChange: (next: DataTableDensity) => void;
  labels: Pick<
    DataTableToolsLabels,
    | "customize"
    | "customizeTitle"
    | "customizeDescription"
    | "columnsTitle"
    | "columnsDescription"
    | "reset"
    | "pinLeft"
    | "pinRight"
    | "pinNone"
    | "drag"
    | "density"
    | "densityCompact"
    | "densityDefault"
    | "densityRelaxed"
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

  const configurableColumns = React.useMemo(
    () => orderedColumns.filter((col) => !isLockedColumn(col)),
    [orderedColumns],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
  );

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
  }, []);

  const resetAll = React.useCallback(() => {
    if (props.onResetColumnVisibility) props.onResetColumnVisibility();
    else props.table.resetColumnVisibility();
    props.table.resetColumnPinning();
    props.table.resetColumnOrder();
  }, [props.onResetColumnVisibility, props.table]);

  const activeLabel = React.useMemo(() => {
    if (!activeId) return null;
    const col = leafColumns.find((c) => c.id === activeId);
    return col ? resolveDataTableColumnLabel(col) : activeId;
  }, [activeId, leafColumns]);
  const activeColumn = React.useMemo(() => {
    if (!activeId) return null;
    return leafColumns.find((c) => c.id === activeId) ?? null;
  }, [activeId, leafColumns]);

  const chooseDensity = React.useCallback(
    (next: DataTableDensity) => {
      props.onDensityChange(clampDensity(next));
    },
    [props],
  );

  return (
    <DropdownCardRoot open={open} onOpenChange={setOpen}>
      <DropdownCardTrigger asChild>
        <span className="inline-flex">
          <DataTableToolTooltip label={props.labels.customize}>
            <IconButton label={props.labels.customize}>
              <SlidersHorizontal className={ICON_CLASS} />
            </IconButton>
          </DataTableToolTooltip>
        </span>
      </DropdownCardTrigger>

      <DropdownCardContent
        align="end"
        sideOffset={8}
        className="w-[720px] max-w-[92vw] data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        <DropdownCardHeader className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">{props.labels.customizeTitle}</div>
            <div className="text-footnote text-label-secondary">
              {props.labels.customizeDescription}
            </div>
          </div>

          <DataTableToolTooltip label={props.labels.reset}>
            <DataTableDefaultIconButton label={props.labels.reset} onClick={resetAll}>
              <RotateCcw className={ICON_CLASS} />
            </DataTableDefaultIconButton>
          </DataTableToolTooltip>
        </DropdownCardHeader>

        <DropdownCardBody className="py-3">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 rounded-xl border bg-muted/5 p-3">
              <div className="flex items-start justify-between gap-3 pb-3">
                <div className="min-w-0">
                  <div className="text-footnote font-medium">{props.labels.columnsTitle}</div>
                  <div className="text-caption text-label-secondary">
                    {props.labels.columnsDescription}
                  </div>
                </div>
                <div className="text-caption text-label-secondary">
                  {configurableColumns.length}
                </div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={onDragCancel}
              >
                <SortableContext
                  items={configurableColumns.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="max-h-[360px] overflow-auto pr-1">
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
                  </div>
                </SortableContext>

                <DragOverlay
                  adjustScale={false}
                  dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}
                >
                  {activeColumn ? (
                    <DataTableColumnSettingsRowOverlay
                      table={props.table}
                      column={activeColumn}
                      labels={props.labels}
                    />
                  ) : activeLabel ? (
                    <div className="rounded-xl border px-3 py-2 opacity-80 ring-2 ring-ring/50">
                      <div className="truncate text-footnote font-medium">{activeLabel}</div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>

            <div className="min-w-0 rounded-xl border bg-muted/5 p-3">
              <div className="pb-3">
                <div className="text-footnote font-medium">{props.labels.density}</div>
              </div>

              <div className="pb-3">
                <DataTableDensityDiagram density={props.density} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <DataTableDensityOptionButton
                  label={props.labels.densityCompact}
                  density="compact"
                  active={props.density === "compact"}
                  onClick={() => chooseDensity("compact")}
                />
                <DataTableDensityOptionButton
                  label={props.labels.densityDefault}
                  density="default"
                  active={props.density === "default"}
                  onClick={() => chooseDensity("default")}
                />
                <DataTableDensityOptionButton
                  label={props.labels.densityRelaxed}
                  density="relaxed"
                  active={props.density === "relaxed"}
                  onClick={() => chooseDensity("relaxed")}
                />
              </div>
            </div>
          </div>
        </DropdownCardBody>
      </DropdownCardContent>
    </DropdownCardRoot>
  );
}
