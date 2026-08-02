import * as React from "react";
import {
  ListFilterIcon,
  FunnelXIcon,
  ArrowUpDownIcon,
  ShieldCheckIcon,
  UserRoundCheckIcon,
} from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DataTableToolbarTools,
  type DataTableRowHeight,
  type DataTableToolsLabels,
} from "@arclayer/ui/data-table";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import type { WorkspaceRoleOut as Role } from "@arclayer/openapi";
import type {
  MembershipStatus,
  TeamMemberSort,
  TeamMembersFilters,
  UserStatus,
} from "@/pages/workspaces/team/shared/types";

type TeamMemberFilterValue = string;

type TeamMembersPageToolbarProps<TData> = {
  table: ReactTable<TData>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: TeamMembersFilters;
  onFiltersChange: (next: TeamMembersFilters) => void;
  sort: TeamMemberSort;
  onSortChange: (next: TeamMemberSort) => void;
  roles: Role[];
  rolesLoading?: boolean;
  rowHeight: DataTableRowHeight;
  onRowHeightChange: (next: DataTableRowHeight) => void;
  wrapHeaders: boolean;
  onWrapHeadersChange: (next: boolean) => void;
  refreshing?: boolean;
  onRefresh: () => void;
  onResetColumnVisibility?: () => void;
  toolsLabels: DataTableToolsLabels;
};

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function toReuiFilters(filters: TeamMembersFilters): Filter<TeamMemberFilterValue>[] {
  const next: Filter<TeamMemberFilterValue>[] = [];

  if (filters.membershipStatus) {
    next.push(createFilter("membershipStatus", "is", [filters.membershipStatus]));
  }
  if (filters.userStatus) {
    next.push(createFilter("userStatus", "is", [filters.userStatus]));
  }
  if (filters.roleCode) {
    next.push(createFilter("roleCode", "is", [filters.roleCode]));
  }

  return next;
}

function fromReuiFilters(filters: Filter<TeamMemberFilterValue>[]): TeamMembersFilters {
  const next: TeamMembersFilters = {};

  for (const filter of filters) {
    const first = filter.values[0];
    if (typeof first !== "string" || !first) continue;

    if (filter.field === "membershipStatus") {
      next.membershipStatus = first as MembershipStatus;
      continue;
    }
    if (filter.field === "userStatus") {
      next.userStatus = first as UserStatus;
      continue;
    }
    if (filter.field === "roleCode") {
      next.roleCode = first;
    }
  }

  return next;
}

export function TeamMembersPageToolbar<TData>({
  table,
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  roles,
  rolesLoading = false,
  rowHeight,
  onRowHeightChange,
  wrapHeaders,
  onWrapHeadersChange,
  refreshing = false,
  onRefresh,
  onResetColumnVisibility,
  toolsLabels,
}: TeamMembersPageToolbarProps<TData>) {
  const { t } = useTranslation(["common", "team"]);

  const filterItems = React.useMemo(() => toReuiFilters(filters), [filters]);
  const reuiI18n = React.useMemo(() => buildReuiFilterI18n(t, t("team:TEAM_FILTER_TITLE")), [t]);

  const fields = React.useMemo<FilterFieldConfig<TeamMemberFilterValue>[]>(
    () => [
      {
        key: "membershipStatus",
        label: t("team:TEAM_FILTER_FIELD_MEMBERSHIP_STATUS"),
        type: "select",
        icon: <ShieldCheckIcon className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          {
            value: "active",
            label: t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE"),
          },
          {
            value: "invited",
            label: t("team:TEAM_MEMBERSHIP_STATUS_INVITED"),
          },
          {
            value: "disabled",
            label: t("team:TEAM_MEMBERSHIP_STATUS_DISABLED"),
          },
        ],
      },
      {
        key: "userStatus",
        label: t("team:TEAM_FILTER_FIELD_USER_STATUS"),
        type: "select",
        icon: <UserRoundCheckIcon className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          {
            value: "active",
            label: t("team:TEAM_USER_STATUS_ACTIVE"),
          },
          {
            value: "disabled",
            label: t("team:TEAM_USER_STATUS_DISABLED"),
          },
          {
            value: "locked",
            label: t("team:TEAM_USER_STATUS_LOCKED"),
          },
        ],
      },
      {
        key: "roleCode",
        label: t("team:TEAM_FILTER_FIELD_ROLE"),
        type: "select",
        icon: <ArrowUpDownIcon className="size-4" />,
        searchable: true,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: roles.map((role) => ({
          value: role.code,
          label: role.name || role.code,
        })),
      },
    ],
    [roles, t],
  );

  return (
    <PageExtraToolbar
      className="items-center"
      leading={
        <>
          <DataTableSearchInput
            value={searchInput}
            onChange={onSearchInputChange}
            placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
          />

          <Select value={sort} onValueChange={(next) => onSortChange(next as TeamMemberSort)}>
            <SelectTrigger className="w-[13rem] min-w-[13rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" position="popper">
              <SelectItem value="-created_at">{t("team:TEAM_SORT_NEWEST")}</SelectItem>
              <SelectItem value="user__username">{t("team:TEAM_SORT_USERNAME_AZ")}</SelectItem>
              <SelectItem value="-user__username">{t("team:TEAM_SORT_USERNAME_ZA")}</SelectItem>
              <SelectItem value="user__email">{t("team:TEAM_SORT_EMAIL_AZ")}</SelectItem>
              <SelectItem value="-user__email">{t("team:TEAM_SORT_EMAIL_ZA")}</SelectItem>
              <SelectItem value="-user__last_login_at">
                {t("team:TEAM_SORT_LAST_LOGIN_RECENT")}
              </SelectItem>
              <SelectItem value="user__last_login_at">
                {t("team:TEAM_SORT_LAST_LOGIN_OLD")}
              </SelectItem>
              <SelectItem value="status">{t("team:TEAM_SORT_MEMBER_STATUS")}</SelectItem>
              <SelectItem value="-status">{t("team:TEAM_SORT_MEMBER_STATUS_DESC")}</SelectItem>
            </SelectContent>
          </Select>

          <Filters
            filters={filterItems}
            fields={fields}
            onChange={(next) => onFiltersChange(fromReuiFilters(next))}
            i18n={reuiI18n}
            allowMultiple={false}
            enableShortcut
            shortcutKey="f"
            shortcutLabel="F"
            trigger={
              <Button variant="outline" disabled={rolesLoading}>
                <ListFilterIcon className="size-4" />
              </Button>
            }
          />

          {filterItems.length > 0 ? (
            <Button variant="outline" onClick={() => onFiltersChange({})}>
              <FunnelXIcon className="size-4" />
              {t("team:TEAM_FILTER_RESET")}
            </Button>
          ) : null}
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
      leadingClassName="items-center"
      trailingClassName="justify-end"
    />
  );
}
