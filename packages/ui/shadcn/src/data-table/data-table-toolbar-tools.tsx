"use client";

import type { Table as ReactTable } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";

import { DataTableColumnsPanel } from "./data-table-columns-panel";
import { resolveDataTableRowHeight } from "./types";
import { DataTableViewOptions } from "./data-table-view-options";
import { DataTableDefaultIconButton } from "./data-table-icon-button";
import { DataTableToolTooltip } from "./data-table-tool-tooltip";
import type {
  DataTableIconButtonProps,
  DataTableToolbarToolsProps,
  DataTableToolsComponents,
} from "./data-table-tools.types";

const ICON_CLASS = "size-4";

function resolveIconButton(components: DataTableToolsComponents | undefined) {
  return (components?.IconButton ?? DataTableDefaultIconButton) as React.ComponentType<
    DataTableIconButtonProps & { className?: string }
  >;
}

export function DataTableToolbarTools<TData>(props: DataTableToolbarToolsProps<TData>) {
  const IconButton = resolveIconButton(props.components);
  const rowHeight = resolveDataTableRowHeight(props.rowHeight ?? props.density);
  const resetAll = () => {
    if (props.onResetColumnVisibility) props.onResetColumnVisibility();
    else props.table.resetColumnVisibility();
    props.table.resetColumnOrder();
    props.table.resetColumnPinning();
    props.onRowHeightChange?.("medium");
    props.onWrapHeadersChange?.(false);
  };

  return (
    <div className="flex items-center gap-2">
      <DataTableColumnsPanel
        table={props.table as ReactTable<TData>}
        labels={props.labels}
        components={props.components}
        onResetColumnVisibility={props.onResetColumnVisibility}
      />

      <DataTableViewOptions
        rowHeight={rowHeight}
        onRowHeightChange={props.onRowHeightChange ?? (() => undefined)}
        wrapHeaders={props.wrapHeaders ?? false}
        onWrapHeadersChange={props.onWrapHeadersChange ?? (() => undefined)}
        labels={props.labels}
        components={props.components}
        onReset={resetAll}
      />

      <DataTableToolTooltip label={props.labels.refresh}>
        <IconButton
          label={props.labels.refresh}
          disabled={props.refreshing}
          onClick={props.onRefresh}
        >
          <RefreshCw className={props.refreshing ? `${ICON_CLASS} animate-spin` : ICON_CLASS} />
        </IconButton>
      </DataTableToolTooltip>
    </div>
  );
}
