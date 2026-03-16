import type { Table as ReactTable } from "@tanstack/react-table";
import { Plus } from "@arclayer/ui/icons/lucide-animated";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DataTableToolbarTools,
  type DataTableRowHeight,
  type DataTableToolsLabels,
} from "@arclayer/ui/data-table";

import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { PageExtraToolbar } from "@/components/common/page-extra-toolbar";
import type { OrganizationMember } from "@/types/api";
import { MembersFilterPopover, type OrgMemberFilters } from "./members-filter-popover";

interface OrganizationMembersInviteActionProps {
  onInvite: () => void;
}

export function OrganizationMembersInviteAction({
  onInvite,
}: OrganizationMembersInviteActionProps) {
  const { t } = useTranslation(["common"]);

  return (
    <Button onClick={onInvite}>
      <Plus size={16} />
      {t("common:ORG_MEMBERS_INVITE")}
    </Button>
  );
}

interface OrganizationMembersToolbarProps {
  table: ReactTable<OrganizationMember>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: OrgMemberFilters;
  onFiltersChange: (next: OrgMemberFilters) => void;
  roleOptions: Array<{ value: string; label: string }>;
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onResetColumnVisibility?: () => void;
  toolsLabels: DataTableToolsLabels;
}

export function OrganizationMembersToolbar({
  table,
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
  roleOptions,
  rowHeight,
  onRowHeightChange,
  wrapHeaders,
  onWrapHeadersChange,
  refreshing,
  onRefresh,
  onResetColumnVisibility,
  toolsLabels,
}: OrganizationMembersToolbarProps) {
  const { t } = useTranslation(["common", "team"]);

  return (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={searchInput}
            onChange={onSearchInputChange}
            placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
          />

          <MembersFilterPopover
            value={filters}
            onChange={onFiltersChange}
            roleOptions={roleOptions}
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
          labels={toolsLabels}
          components={{ IconButton: DataTableToolbarAntdIconButton }}
        />
      }
      leadingClassName="items-start"
      trailingClassName="justify-end"
    />
  );
}
