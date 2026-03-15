import type { Table as ReactTable } from "@tanstack/react-table";

import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import {
  DataTableToolbarTools,
  type DataTableDensity,
  type DataTableToolsLabels,
} from "@celestial/ui/data-table";
import { Input } from "@celestial/ui/input";

type SearchToolbarProps = {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  placeholder: string;
};

export function SecuritySessionsSearchToolbar(props: SearchToolbarProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        value={props.searchInput}
        onChange={(event) => props.onSearchInputChange(event.target.value)}
        placeholder={props.placeholder}
        className="max-w-[320px]"
      />
    </div>
  );
}

type ToolsToolbarProps<TData> = {
  table: ReactTable<TData>;
  density: DataTableDensity;
  onDensityChange: (next: DataTableDensity) => void;
  onRefresh: () => Promise<unknown> | void;
  refreshing: boolean;
  onResetColumnVisibility: () => void;
  labels: DataTableToolsLabels;
};

export function SecuritySessionsToolsToolbar<TData>(props: ToolsToolbarProps<TData>) {
  return (
    <div className="flex items-center gap-2">
      <DataTableToolbarTools
        table={props.table}
        density={props.density}
        onDensityChange={props.onDensityChange}
        onRefresh={() => void props.onRefresh()}
        refreshing={props.refreshing}
        onResetColumnVisibility={props.onResetColumnVisibility}
        labels={props.labels}
        components={{ IconButton: DataTableToolbarAntdIconButton }}
      />
    </div>
  );
}
