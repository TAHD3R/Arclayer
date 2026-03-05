"use client";

import { RefreshCw } from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import * as React from "react";

import { DataTableCustomizeCard } from "./data-table-customize-card";
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

  return (
    <div className="flex items-center gap-2">
      <DataTableCustomizeCard
        table={props.table as ReactTable<TData>}
        density={props.density}
        onDensityChange={props.onDensityChange}
        labels={props.labels}
        components={props.components}
        onResetColumnVisibility={props.onResetColumnVisibility}
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
