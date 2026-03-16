import { type Table } from "@tanstack/react-table";

import { ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import {
  DataTableToolbarTools,
  type DataTableRowHeight,
  type DataTableToolsLabels,
} from "@arclayer/ui/data-table";

import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { PageExtraToolbar } from "@/components/common/page-extra-toolbar";

type TeamInvitationsPageExtraProps<TTab extends string> = {
  tabs: Array<{ value: TTab; label: string }>;
  table: Table<any>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  searchPlaceholder: string;
  clearLabel: string;
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onResetColumnVisibility?: () => void;
  labels: DataTableToolsLabels;
};

export function TeamInvitationsPageExtra<TTab extends string>({
  tabs,
  table,
  searchInput,
  onSearchInputChange,
  searchPlaceholder,
  clearLabel,
  rowHeight,
  onRowHeightChange,
  wrapHeaders,
  onWrapHeadersChange,
  onRefresh,
  refreshing,
  onResetColumnVisibility,
  labels,
}: TeamInvitationsPageExtraProps<TTab>) {
  return (
    <PageExtraToolbar
      leading={
        <>
          <ChromeTabsList className="w-auto">
            {tabs.map((tab) => (
              <ChromeTabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>

          <DataTableSearchInput
            value={searchInput}
            onChange={onSearchInputChange}
            placeholder={searchPlaceholder}
            clearLabel={clearLabel}
          />
        </>
      }
      trailing={
        <DataTableToolbarTools
          table={table}
          rowHeight={rowHeight}
          onRowHeightChange={onRowHeightChange}
          wrapHeaders={wrapHeaders}
          onWrapHeadersChange={onWrapHeadersChange}
          onRefresh={onRefresh}
          refreshing={refreshing}
          onResetColumnVisibility={onResetColumnVisibility}
          labels={labels}
          components={{ IconButton: DataTableToolbarAntdIconButton }}
        />
      }
      leadingClassName="items-start"
      trailingClassName="justify-end"
    />
  );
}
