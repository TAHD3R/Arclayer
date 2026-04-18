import type { Table } from "@tanstack/react-table";

import { ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import {
  DataTableToolbarTools,
  type DataTableRowHeight,
  type DataTableToolsLabels,
} from "@arclayer/ui/data-table";

import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";

import type { UserCenterProjectsTranslateFn, UserCenterProjectsViewMode } from "../types";
import { ProjectsViewModeToggle } from "./projects-view-mode-toggle";

interface UserCenterProjectsToolbarProps {
  t: UserCenterProjectsTranslateFn;
  table: Table<any>;
  searchInput: string;
  onSearchInputChange: (nextValue: string) => void;
  viewMode: UserCenterProjectsViewMode;
  onViewModeChange: (nextMode: UserCenterProjectsViewMode) => void;
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onResetColumnVisibility?: () => void;
  labels: DataTableToolsLabels;
}

export function UserCenterProjectsToolbar(props: UserCenterProjectsToolbarProps) {
  return (
    <PageExtraToolbar
      className="items-center"
      leading={
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="active">
            {props.t("account:ACCOUNT_PROJECTS_TAB_ACTIVE")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="archived">
            {props.t("account:ACCOUNT_PROJECTS_TAB_ARCHIVED")}
          </ChromeTabsTrigger>
        </ChromeTabsList>
      }
      trailing={
        <>
          {props.viewMode === "table" ? (
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

          <ProjectsViewModeToggle
            t={props.t}
            value={props.viewMode}
            onChange={props.onViewModeChange}
          />

          <DataTableSearchInput
            value={props.searchInput}
            onChange={props.onSearchInputChange}
            placeholder={props.t("account:ACCOUNT_PROJECTS_SEARCH_PLACEHOLDER")}
            clearLabel={props.t("common:CLEAR")}
          />
        </>
      }
      leadingClassName="items-center"
      trailingClassName="justify-end"
    />
  );
}
