import type { SortingState, Table } from "@tanstack/react-table";

import { ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import {
  DataTableToolbarTools,
  type DataTableRowHeight,
  type DataTableToolsLabels,
} from "@arclayer/ui/data-table";

import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { ViewModeToggle } from "@/components/common/view-mode-toggle";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";

import type {
  UserCenterProjectListItem,
  UserCenterProjectsTranslateFn,
  UserCenterProjectsSortValue,
  UserCenterProjectsViewMode,
} from "../types";

interface UserCenterProjectsToolbarProps {
  t: UserCenterProjectsTranslateFn;
  table: Table<UserCenterProjectListItem>;
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
  sorting?: SortingState;
  onSortingChange?: (next: SortingState) => void;
}

const PROJECT_SORT_OPTIONS: ReadonlyArray<{
  value: UserCenterProjectsSortValue;
  labelKey: string;
}> = [
  { value: "-created_at", labelKey: "account:ACCOUNT_PROJECTS_SORT_NEWEST" },
  { value: "created_at", labelKey: "account:ACCOUNT_PROJECTS_SORT_OLDEST" },
  { value: "name", labelKey: "account:ACCOUNT_PROJECTS_SORT_NAME_ASC" },
  { value: "-name", labelKey: "account:ACCOUNT_PROJECTS_SORT_NAME_DESC" },
  { value: "-member_count", labelKey: "account:ACCOUNT_PROJECTS_SORT_MEMBERS_DESC" },
  { value: "member_count", labelKey: "account:ACCOUNT_PROJECTS_SORT_MEMBERS_ASC" },
];

function toSortValue(sorting: SortingState = []): UserCenterProjectsSortValue {
  const [first] = sorting;
  if (first?.id === "project") return first.desc ? "-name" : "name";
  if (first?.id === "members") return first.desc ? "-member_count" : "member_count";
  if (first?.id === "createdAt") return first.desc ? "-created_at" : "created_at";
  return "-created_at";
}

function toSorting(value: UserCenterProjectsSortValue): SortingState {
  if (value === "name" || value === "-name") {
    return [{ id: "project", desc: value === "-name" }];
  }
  if (value === "member_count" || value === "-member_count") {
    return [{ id: "members", desc: value === "-member_count" }];
  }
  return [{ id: "createdAt", desc: value === "-created_at" }];
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
          <Select
            value={toSortValue(props.sorting)}
            onValueChange={(next) =>
              props.onSortingChange?.(toSorting(next as UserCenterProjectsSortValue))
            }
          >
            <SelectTrigger
              size="sm"
              className="w-40 min-w-40"
              aria-label={props.t("account:ACCOUNT_PROJECTS_SORT_LABEL")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="end"
              position="popper"
              className="w-(--radix-select-trigger-width) min-w-(--radix-select-trigger-width)"
            >
              <SelectGroup>
                {PROJECT_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {props.t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

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

          <ViewModeToggle t={props.t} value={props.viewMode} onChange={props.onViewModeChange} />

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
