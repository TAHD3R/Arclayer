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

import { cn } from "@celestial/lib/utils";

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
import type { DataTableDensity } from "./types";
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

const HEADER_DRAG_DISTANCE_PX = 6;

type DataTablePresenterProps<TData> = {
  table: ReactTable<TData>;
  emptyText: string;
  className?: string;
  tableClassName?: string;
  toolbar?: DataTableToolbarSlots;
  density?: DataTableDensity;
  refreshing?: boolean;
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
    density = "default",
    refreshing = false,
    rowClassName,
    onRowClick,
    headerCellClassName,
    cellClassName,
  } = props;

  const hasToolbarRow = Boolean(toolbar?.left || toolbar?.right);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canScrollRight = useScrollOverflow(scrollRef);

  // Compute total width of right-pinned columns for gradient positioning.
  const rightPinnedWidth = table.getRightLeafColumns().reduce((sum, col) => sum + col.getSize(), 0);
  const hasRightPinned = rightPinnedWidth > 0;

  const normalizedOrder = useNormalizedDataTableColumnOrder(table);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: HEADER_DRAG_DISTANCE_PX } }),
  );

  const [activeHeaderId, setActiveHeaderId] = useState<string | null>(null);
  const [overHeaderId, setOverHeaderId] = useState<string | null>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);
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
    const w = rect.width;
    return Number.isFinite(w) && w > 0 ? w : null;
  }, []);

  const onHeaderDragStart = useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id);
      activeHeaderIdRef.current = id;
      initialOrderRef.current = [...normalizedOrder];
      leafIdsRef.current = table.getAllLeafColumns().map((c) => c.id);
      lastValidOverHeaderIdRef.current = null;
      setActiveHeaderId(id);
      setActiveOverlayWidth(measureColumnWidth(id));
    },
    [measureColumnWidth, normalizedOrder, table],
  );

  const onHeaderDragEnd = useCallback(
    (e: DragEndEvent) => {
      const nextOverId = e.over ? String(e.over.id) : null;
      const nextActiveId = String(e.active.id);

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

      const resolvedLeafIds = leafIds ?? table.getAllLeafColumns().map((c) => c.id);
      const normalized = normalizeDataTableColumnOrder(resolvedLeafIds, initialOrder);
      table.setColumnOrder(
        moveDataTableColumnInUnlockedZone(normalized, nextActiveId, resolvedOverId),
      );
    },
    [table],
  );

  const activeHeaderLabel = useMemo(() => {
    if (!activeHeaderId) return null;
    const col = table.getColumn(activeHeaderId);
    if (!col) return activeHeaderId;
    return resolveDataTableColumnLabel({ id: col.id, columnDef: col.columnDef });
  }, [activeHeaderId, table]);

  const activeHeaderWidth = useMemo(() => {
    if (!activeHeaderId) return null;
    return activeOverlayWidth ?? table.getColumn(activeHeaderId)?.getSize() ?? null;
  }, [activeHeaderId, activeOverlayWidth, table]);

  const draggableLeafHeaderIds = table
    .getVisibleLeafColumns()
    .filter((c) => !isLockedColumn({ id: c.id, columnDef: { meta: c.columnDef.meta } }))
    .map((c) => c.id);

  const onHeaderHoverChange = useCallback((next: string | null) => {
    setHoveredColumnId(next);
  }, []);

  return (
    <div className={cn("min-h-0 flex flex-col", className)}>
      {toolbar?.fullWidth ? <div className="pb-3">{toolbar.fullWidth}</div> : null}

      {hasToolbarRow ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">{toolbar?.left}</div>
          <div className="flex shrink-0 items-center gap-2">{toolbar?.right}</div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn("relative isolate flex-1 min-h-0 overflow-auto bg-transparent")}
      >
        <div
          className={cn(
            "relative min-h-full transition-[filter,opacity] duration-200",
            refreshing ? "pointer-events-none blur-sm opacity-90" : "",
          )}
        >
          <DataTableScrollOverflowGradient
            enabled={hasRightPinned}
            visible={canScrollRight}
            rightOffset={rightPinnedWidth}
          />

          {/* Render <table> directly — the Table component adds a nested overflow-auto
              wrapper that would capture scroll events before our scrollRef container. */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onHeaderDragStart}
            onDragOver={(e) => {
              const nextOverId = e.over ? String(e.over.id) : null;
              setOverHeaderId(nextOverId);

              const nextActiveId = activeHeaderIdRef.current;
              if (!nextOverId) return;
              if (!nextActiveId) return;
              if (nextOverId === nextActiveId) return;
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
            <table className={cn("w-full caption-bottom text-callout", tableClassName)}>
              <SortableContext
                items={draggableLeafHeaderIds}
                strategy={horizontalListSortingStrategy}
              >
                <DataTablePresenterHeader
                  table={table}
                  density={density}
                  headerCellClassName={headerCellClassName}
                  dragging={{ activeId: activeHeaderId, overId: overHeaderId }}
                  hoveredColumnId={hoveredColumnId}
                  onHeaderHoverChange={onHeaderHoverChange}
                />
              </SortableContext>

              <DataTablePresenterBody
                table={table}
                emptyText={emptyText}
                density={density}
                activeColumnId={activeHeaderId}
                overColumnId={overHeaderId}
                hoveredColumnId={hoveredColumnId}
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
                  density={density}
                  width={activeHeaderWidth}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        <DataTableRefreshOverlay active={refreshing} />
      </div>
    </div>
  );
}
