import type React from "react";
import type { Table as ReactTable } from "@tanstack/react-table";

import type { AdminAssetTagOut as AdminAssetTag } from "@arclayer/openapi";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import {
  ViewModeToggle,
  type ViewMode as AssetsViewMode,
} from "@/components/common/view-mode-toggle";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import {
  DataTableToolbarTools,
  type DataTableRowHeight,
  type DataTableToolsLabels,
} from "@arclayer/ui/data-table";
import { AssetsFilterPopover } from "./assets-filter-popover";

interface AssetsFilterValue {
  mimePrefix?: string;
  visibility?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];
}

interface AssetsViewHeaderProps<TData = unknown> {
  t: (key: string, options?: Record<string, unknown>) => string;
  viewMode: AssetsViewMode;
  onViewModeChange: (next: AssetsViewMode) => void;
  setFilters: React.Dispatch<React.SetStateAction<AssetsFilterValue>>;
  searchInput: string;
  setSearchInput: React.Dispatch<React.SetStateAction<string>>;
  filters: AssetsFilterValue;
  ordering: string;
  setOrdering: React.Dispatch<React.SetStateAction<string>>;
  tags: AdminAssetTag[];
  tagsLoading: boolean;
  table?: ReactTable<TData>;
  rowHeight?: DataTableRowHeight;
  onRowHeightChange?: (next: DataTableRowHeight) => void;
  wrapHeaders?: boolean;
  onWrapHeadersChange?: (next: boolean) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onResetColumnVisibility?: () => void;
  labels?: DataTableToolsLabels;
}

export function AssetsViewHeader<TData = unknown>(props: AssetsViewHeaderProps<TData>) {
  return (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={props.searchInput}
            onChange={props.setSearchInput}
            placeholder={props.t("assets:ASSET_SEARCH_PLACEHOLDER")}
            clearLabel={props.t("common:CLEAR")}
          />

          <AssetsFilterPopover
            value={props.filters}
            onChange={props.setFilters}
            ordering={props.ordering}
            onOrderingChange={props.setOrdering}
            defaultOrdering="-created_at"
            tags={props.tags}
            tagsLoading={props.tagsLoading}
          />
        </>
      }
      trailing={
        <>
          {props.viewMode === "table" &&
          props.table &&
          props.rowHeight &&
          props.onRowHeightChange &&
          typeof props.wrapHeaders === "boolean" &&
          props.onWrapHeadersChange &&
          props.onRefresh &&
          props.labels ? (
            <DataTableToolbarTools
              table={props.table}
              rowHeight={props.rowHeight}
              onRowHeightChange={props.onRowHeightChange}
              wrapHeaders={props.wrapHeaders}
              onWrapHeadersChange={props.onWrapHeadersChange}
              onRefresh={props.onRefresh}
              refreshing={props.refreshing}
              onResetColumnVisibility={props.onResetColumnVisibility}
              labels={props.labels}
              components={{ IconButton: DataTableToolbarAntdIconButton }}
            />
          ) : null}

          <ViewModeToggle t={props.t} value={props.viewMode} onChange={props.onViewModeChange} />
        </>
      }
      trailingClassName="justify-end"
    />
  );
}
