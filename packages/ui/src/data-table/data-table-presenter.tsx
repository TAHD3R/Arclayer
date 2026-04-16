"use client";

import { type Header, type Table as ReactTable } from "@tanstack/react-table";
import { type MouseEvent, useCallback, useRef, useState } from "react";

import { cn } from "@arclayer/lib/utils";

import { DataTablePresenterBody } from "./data-table-presenter-body";
import { DataTablePresenterHeader } from "./data-table-presenter-header";
import { DataTableRefreshOverlay } from "./data-table-refresh-overlay";
import { DataTableScrollOverflowGradient } from "./data-table-scroll-overflow-gradient";
import { useNormalizedDataTableColumnOrder } from "./data-table-column-settings-utils";
import type { DataTableColumnHeaderFilterAction } from "./data-table-column-header-menu";
import type { DataTableColumnMenuLabels } from "./data-table-tools.types";
import { resolveDataTableRowHeight, type DataTableDensity, type DataTableRowHeight } from "./types";
import { useScrollOverflow } from "./use-scroll-overflow";

type DataTableToolbarSlots = {
  fullWidth?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
};

type DataTableSurface = "card" | "embedded";

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
  wrapContent?: boolean;
  onWrapContentChange?: (next: boolean) => void;
  refreshing?: boolean;
  refreshingLabel?: string;
  columnMenuLabels?: DataTableColumnMenuLabels;
  resolveColumnFilterAction?: (
    header: Header<TData, unknown>,
  ) => DataTableColumnHeaderFilterAction | undefined;
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
    wrapContent: controlledWrapContent,
    onWrapContentChange,
    refreshing = false,
    refreshingLabel = "Refreshing data...",
    columnMenuLabels,
    resolveColumnFilterAction,
    rowClassName,
    onRowClick,
    headerCellClassName,
    cellClassName,
  } = props;
  const wrapContentControlled =
    typeof controlledWrapContent === "boolean" && typeof onWrapContentChange === "function";
  const [internalWrapContent, setInternalWrapContent] = useState(Boolean(controlledWrapContent));

  const resolvedRowHeight = resolveDataTableRowHeight(rowHeight ?? density);
  const resolvedWrapContent = wrapContentControlled ? controlledWrapContent : internalWrapContent;
  const hasToolbarRow = Boolean(toolbar?.left || toolbar?.right);
  const hasToolbar = Boolean(toolbar?.fullWidth || hasToolbarRow);
  const hasFooter = Boolean(footer);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canScrollRight = useScrollOverflow(scrollRef);

  const rightPinnedWidth = table.getRightLeafColumns().reduce((sum, col) => sum + col.getSize(), 0);
  const hasRightPinned = rightPinnedWidth > 0;

  useNormalizedDataTableColumnOrder(table);

  const handleWrapContentChange = useCallback(
    (next: boolean) => {
      if (wrapContentControlled) {
        onWrapContentChange(next);
        return;
      }
      setInternalWrapContent(next);
    },
    [onWrapContentChange, wrapContentControlled],
  );

  const surfaceClassName =
    surface === "embedded" ? "rounded-none border-0 bg-transparent " : "rounded-lg bg-background ";
  const sectionPaddingClass = "px-0";

  return (
    <div className={cn("min-h-0 flex flex-col", className)}>
      <div
        className={cn("relative min-h-0 flex flex-1 flex-col overflow-hidden", surfaceClassName)}
      >
        {hasToolbar ? (
          <div className={cn("bg-transparent py-3", sectionPaddingClass)}>
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

          <table className={cn("min-w-full caption-bottom text-callout", tableClassName)}>
            <DataTablePresenterHeader
              table={table}
              rowHeight={resolvedRowHeight}
              wrapHeaders={wrapHeaders}
              wrapContent={resolvedWrapContent}
              onWrapContentChange={handleWrapContentChange}
              headerCellClassName={headerCellClassName}
              labels={columnMenuLabels}
              resolveColumnFilterAction={resolveColumnFilterAction}
            />

            <DataTablePresenterBody
              table={table}
              emptyText={emptyText}
              rowHeight={resolvedRowHeight}
              wrapContent={resolvedWrapContent}
              activeColumnId={null}
              overColumnId={null}
              rowClassName={rowClassName}
              onRowClick={onRowClick}
              cellClassName={cellClassName}
            />
          </table>
        </div>

        {hasFooter ? (
          <div className={cn("bg-transparent py-3", sectionPaddingClass)}>{footer}</div>
        ) : null}

        <DataTableRefreshOverlay active={refreshing} label={refreshingLabel} />
      </div>
    </div>
  );
}
