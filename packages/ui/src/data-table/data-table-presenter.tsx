"use client";

import { type Header, type Table as ReactTable } from "@tanstack/react-table";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@arclayer/lib/utils";

import { DataTableColumnDragOverlay } from "./data-table-column-drag-overlay";
import { DataTablePresenterBody } from "./data-table-presenter-body";
import { DataTablePresenterHeader } from "./data-table-presenter-header";
import { DataTableRefreshOverlay } from "./data-table-refresh-overlay";
import { DataTableScrollOverflowGradient } from "./data-table-scroll-overflow-gradient";
import {
  isDataTableColumnLocked,
  moveDataTableColumnInUnlockedZone,
  normalizeDataTableColumnOrder,
  resolveDataTableColumnLabel,
  useNormalizedDataTableColumnOrder,
} from "./data-table-column-settings-utils";
import type { DataTableToolsLabels } from "./data-table-tools.types";
import { resolveDataTableRowHeight, type DataTableDensity, type DataTableRowHeight } from "./types";
import { useScrollOverflow } from "./use-scroll-overflow";

type ColumnMeta = { kind?: string };

function isLockedColumn(column: { id: string; columnDef: { meta?: unknown } }): boolean {
  if (isDataTableColumnLocked(column.id)) return true;
  const kind = (column.columnDef.meta as ColumnMeta | undefined)?.kind;
  return kind === "select" || kind === "actions";
}

type DataTableToolbarSlots = {
  fullWidth?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
};

type DataTableSurface = "card" | "embedded";

const HEADER_DRAG_DISTANCE_PX = 6;

type DataTablePresenterProps<TData> = {
  table: ReactTable<TData>;
  emptyText: string;
  className?: string;
  tableClassName?: string;
  toolbar?: DataTableToolbarSlots;
  footer?: React.ReactNode;
  surface?: DataTableSurface;
  rowHeight?: DataTableRowHeight;
  density?: DataTableDensity;
  wrapHeaders?: boolean;
  refreshing?: boolean;
  refreshingLabel?: string;
  columnMenuLabels?: Pick<DataTableToolsLabels, "sortAscending" | "sortDescending" | "hideColumn">;
  rowClassName?: (
    row: import("@tanstack/react-table").Row<TData>,
    rowIndex: number,
  ) => string | undefined;
  onRowClick?: (
    row: import("@tanstack/react-table").Row<TData>,
    rowIndex: number,
    event: MouseEvent<HTMLTableRowElement>,
  ) => void;
  headerCellClassName?: (header: Header<TData, unknown>) => string | undefined;
  cellClassName?: (
    cell: import("@tanstack/react-table").Cell<TData, unknown>,
  ) => string | undefined;
};

export function DataTablePresenter<TData>(props: DataTablePresenterProps<TData>) {
  const {
    table,
    emptyText,
    className,
    tableClassName,
    toolbar,
    footer,
    surface = "card",
    rowHeight,
    density,
    wrapHeaders = false,
    refreshing = false,
    refreshingLabel = "Refreshing data...",
    columnMenuLabels,
    rowClassName,
    onRowClick,
    headerCellClassName,
    cellClassName,
  } = props;

  const resolvedRowHeight = resolveDataTableRowHeight(rowHeight ?? density);
  const hasToolbarRow = Boolean(toolbar?.left || toolbar?.right);
  const hasToolbar = Boolean(toolbar?.fullWidth || hasToolbarRow);
  const hasFooter = Boolean(footer);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canScrollRight = useScrollOverflow(scrollRef);

  const rightPinnedWidth = table.getRightLeafColumns().reduce((sum, col) => sum + col.getSize(), 0);
  const hasRightPinned = rightPinnedWidth > 0;

  const normalizedOrder = useNormalizedDataTableColumnOrder(table);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: HEADER_DRAG_DISTANCE_PX } }),
  );

  const [activeHeaderId, setActiveHeaderId] = useState<string | null>(null);
  const [overHeaderId, setOverHeaderId] = useState<string | null>(null);
  const [activeOverlayWidth, setActiveOverlayWidth] = useState<number | null>(null);

  const activeHeaderIdRef = useRef<string | null>(null);
  const initialOrderRef = useRef<string[] | null>(null);
  const leafIdsRef = useRef<readonly string[] | null>(null);
  const lastValidOverHeaderIdRef = useRef<string | null>(null);

  const measureColumnWidth = useCallback((columnId: string): number | null => {
    const root = scrollRef.current;
    if (!root) return null;
    const attr = columnId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const el =
      root.querySelector<HTMLElement>(`td[data-column-id="${attr}"]`) ??
      root.querySelector<HTMLElement>(`th[data-column-id="${attr}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const width = rect.width;
    return Number.isFinite(width) && width > 0 ? width : null;
  }, []);

  const onHeaderDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      activeHeaderIdRef.current = id;
      initialOrderRef.current = [...normalizedOrder];
      leafIdsRef.current = table.getAllLeafColumns().map((column) => column.id);
      lastValidOverHeaderIdRef.current = null;
      setActiveHeaderId(id);
      setActiveOverlayWidth(measureColumnWidth(id));
    },
    [measureColumnWidth, normalizedOrder, table],
  );

  const onHeaderDragEnd = useCallback(
    (event: DragEndEvent) => {
      const nextOverId = event.over ? String(event.over.id) : null;
      const nextActiveId = String(event.active.id);

      const initialOrder = initialOrderRef.current;
      const leafIds = leafIdsRef.current;
      const lastValidOverId = lastValidOverHeaderIdRef.current;
      const resolvedOverId = nextOverId ?? lastValidOverId;

      setActiveHeaderId(null);
      setOverHeaderId(null);
      setActiveOverlayWidth(null);
      activeHeaderIdRef.current = null;
      initialOrderRef.current = null;
      leafIdsRef.current = null;
      lastValidOverHeaderIdRef.current = null;

      if (!initialOrder) return;

      if (!resolvedOverId || resolvedOverId === nextActiveId) {
        table.setColumnOrder(initialOrder);
        return;
      }
      if (isDataTableColumnLocked(nextActiveId) || isDataTableColumnLocked(resolvedOverId)) {
        table.setColumnOrder(initialOrder);
        return;
      }

      const activePinned = table.getColumn(nextActiveId)?.getIsPinned() ?? false;
      const overPinned = table.getColumn(resolvedOverId)?.getIsPinned() ?? false;
      if (activePinned !== overPinned) {
        table.setColumnOrder(initialOrder);
        return;
      }

      const resolvedLeafIds = leafIds ?? table.getAllLeafColumns().map((column) => column.id);
      const normalized = normalizeDataTableColumnOrder(resolvedLeafIds, initialOrder);
      table.setColumnOrder(
        moveDataTableColumnInUnlockedZone(normalized, nextActiveId, resolvedOverId),
      );
    },
    [table],
  );

  const activeHeaderLabel = useMemo(() => {
    if (!activeHeaderId) return null;
    const column = table.getColumn(activeHeaderId);
    if (!column) return activeHeaderId;
    return resolveDataTableColumnLabel({ id: column.id, columnDef: column.columnDef });
  }, [activeHeaderId, table]);

  const activeHeaderWidth = useMemo(() => {
    if (!activeHeaderId) return null;
    return activeOverlayWidth ?? table.getColumn(activeHeaderId)?.getSize() ?? null;
  }, [activeHeaderId, activeOverlayWidth, table]);

  const draggableLeafHeaderIds = table
    .getVisibleLeafColumns()
    .filter(
      (column) => !isLockedColumn({ id: column.id, columnDef: { meta: column.columnDef.meta } }),
    )
    .map((column) => column.id);

  const surfaceClassName =
    surface === "embedded"
      ? "rounded-none border-0 bg-transparent "
      : "rounded-lg border border-border bg-background ";
  const sectionPaddingClass = "px-0";

  return (
    <div className={cn("min-h-0 flex flex-col", className)}>
      <div
        className={cn("relative min-h-0 flex flex-1 flex-col overflow-hidden", surfaceClassName)}
      >
        {hasToolbar ? (
          <div className={cn("border-b border-border/60 bg-muted/4 py-3", sectionPaddingClass)}>
            {toolbar?.fullWidth ? <div className="min-w-0">{toolbar.fullWidth}</div> : null}

            {hasToolbarRow ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">{toolbar?.left}</div>
                <div className="flex shrink-0 items-center gap-2">{toolbar?.right}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className={cn(
            "relative isolate min-h-0 flex-1 overflow-auto bg-background transition-opacity duration-200",
            refreshing ? "pointer-events-none opacity-90" : "",
          )}
        >
          <DataTableScrollOverflowGradient
            enabled={hasRightPinned}
            visible={canScrollRight}
            rightOffset={rightPinnedWidth}
          />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onHeaderDragStart}
            onDragOver={(event) => {
              const nextOverId = event.over ? String(event.over.id) : null;
              setOverHeaderId(nextOverId);

              const nextActiveId = activeHeaderIdRef.current;
              if (!nextOverId || !nextActiveId || nextOverId === nextActiveId) return;
              if (isDataTableColumnLocked(nextActiveId) || isDataTableColumnLocked(nextOverId))
                return;

              const activePinned = table.getColumn(nextActiveId)?.getIsPinned() ?? false;
              const overPinned = table.getColumn(nextOverId)?.getIsPinned() ?? false;
              if (activePinned !== overPinned) return;

              lastValidOverHeaderIdRef.current = nextOverId;
            }}
            onDragEnd={onHeaderDragEnd}
            onDragCancel={() => {
              const initialOrder = initialOrderRef.current;
              setActiveHeaderId(null);
              setOverHeaderId(null);
              setActiveOverlayWidth(null);
              activeHeaderIdRef.current = null;
              initialOrderRef.current = null;
              leafIdsRef.current = null;
              lastValidOverHeaderIdRef.current = null;
              if (initialOrder) table.setColumnOrder(initialOrder);
            }}
          >
            <table className={cn("min-w-full caption-bottom text-callout", tableClassName)}>
              <SortableContext
                items={draggableLeafHeaderIds}
                strategy={horizontalListSortingStrategy}
              >
                <DataTablePresenterHeader
                  table={table}
                  rowHeight={resolvedRowHeight}
                  wrapHeaders={wrapHeaders}
                  headerCellClassName={headerCellClassName}
                  dragging={{ activeId: activeHeaderId, overId: overHeaderId }}
                  labels={columnMenuLabels}
                />
              </SortableContext>

              <DataTablePresenterBody
                table={table}
                emptyText={emptyText}
                rowHeight={resolvedRowHeight}
                activeColumnId={activeHeaderId}
                overColumnId={overHeaderId}
                rowClassName={rowClassName}
                onRowClick={onRowClick}
                cellClassName={cellClassName}
              />
            </table>

            <DragOverlay
              adjustScale={false}
              dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}
            >
              {activeHeaderLabel ? (
                <DataTableColumnDragOverlay
                  table={table}
                  columnId={activeHeaderId ?? ""}
                  rowHeight={resolvedRowHeight}
                  width={activeHeaderWidth}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {hasFooter ? (
          <div
            className={cn("border-t border-border/60 bg-muted/[0.03] py-3", sectionPaddingClass)}
          >
            {footer}
          </div>
        ) : null}

        <DataTableRefreshOverlay active={refreshing} label={refreshingLabel} />
      </div>
    </div>
  );
}
