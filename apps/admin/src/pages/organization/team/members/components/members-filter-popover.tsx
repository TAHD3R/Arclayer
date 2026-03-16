import { FunnelXIcon, ListFilterIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import {
  Filters,
  createFilter,
  type Filter,
  type FilterFieldConfig,
} from "@/components/reui/filters";
import type { OrgMembershipStatus, OrgUserStatus } from "@/types/api";

export type OrgMemberFilters = {
  roleCode?: string;
  membershipStatus?: OrgMembershipStatus;
  userStatus?: OrgUserStatus;
  hasWorkspace?: boolean;
};

type OrgMemberFilterValue = string;

function toReuiFilters(value: OrgMemberFilters): Filter<OrgMemberFilterValue>[] {
  const next: Filter<OrgMemberFilterValue>[] = [];

  if (value.roleCode) {
    next.push(createFilter("roleCode", "is", [value.roleCode]));
  }
  if (value.membershipStatus) {
    next.push(createFilter("membershipStatus", "is", [value.membershipStatus]));
  }
  if (value.userStatus) {
    next.push(createFilter("userStatus", "is", [value.userStatus]));
  }
  if (typeof value.hasWorkspace === "boolean") {
    next.push(
      createFilter("hasWorkspace", "is", [
        value.hasWorkspace ? "with_workspace" : "without_workspace",
      ]),
    );
  }

  return next;
}

function fromReuiFilters(filters: Filter<OrgMemberFilterValue>[]): OrgMemberFilters {
  const next: OrgMemberFilters = {};

  for (const filter of filters) {
    const first = filter.values[0];
    if (typeof first !== "string" || !first) continue;

    if (filter.field === "roleCode") {
      next.roleCode = first;
      continue;
    }
    if (filter.field === "membershipStatus") {
      next.membershipStatus = first as OrgMembershipStatus;
      continue;
    }
    if (filter.field === "userStatus") {
      next.userStatus = first as OrgUserStatus;
      continue;
    }
    if (filter.field === "hasWorkspace") {
      next.hasWorkspace = first === "with_workspace";
    }
  }

  return next;
}

export function MembersFilterPopover({
  value,
  onChange,
  roleOptions,
}: {
  value: OrgMemberFilters;
  onChange: (next: OrgMemberFilters) => void;
  roleOptions: Array<{ value: string; label: string }>;
}) {
  const { t } = useTranslation(["common", "team"]);
  const filterItems = useMemo(() => toReuiFilters(value), [value]);
  const reuiI18n = useMemo(() => buildReuiFilterI18n(t, t("common:ORG_MEMBERS_FILTER_TITLE")), [t]);
  const fields = useMemo<FilterFieldConfig<OrgMemberFilterValue>[]>(
    () => [
      {
        key: "roleCode",
        label: t("common:ORG_MEMBERS_TABLE_ROLE"),
        type: "select",
        searchable: true,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS", { defaultValue: "is" }) }],
        options: roleOptions,
      },
      {
        key: "membershipStatus",
        label: t("common:ORG_MEMBERS_FILTER_MEMBER_STATUS"),
        type: "select",
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS", { defaultValue: "is" }) }],
        options: [
          { value: "active", label: t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE") },
          { value: "invited", label: t("team:TEAM_MEMBERSHIP_STATUS_INVITED") },
          { value: "disabled", label: t("team:TEAM_MEMBERSHIP_STATUS_DISABLED") },
        ],
      },
      {
        key: "userStatus",
        label: t("common:ORG_MEMBERS_FILTER_USER_STATUS"),
        type: "select",
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS", { defaultValue: "is" }) }],
        options: [
          { value: "active", label: t("team:TEAM_USER_STATUS_ACTIVE") },
          { value: "disabled", label: t("team:TEAM_USER_STATUS_DISABLED") },
          { value: "locked", label: t("team:TEAM_USER_STATUS_LOCKED") },
        ],
      },
      {
        key: "hasWorkspace",
        label: t("common:ORG_MEMBERS_FILTER_WORKSPACE_ASSOCIATION"),
        type: "select",
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS", { defaultValue: "is" }) }],
        options: [
          {
            value: "with_workspace",
            label: t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITH"),
          },
          {
            value: "without_workspace",
            label: t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITHOUT"),
          },
        ],
      },
    ],
    [roleOptions, t],
  );

  return (
    <>
      <Filters
        filters={filterItems}
        fields={fields}
        onChange={(next) => onChange(fromReuiFilters(next))}
        i18n={reuiI18n}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline">
            <ListFilterIcon className="size-4" />
            {t("common:ORG_MEMBERS_FILTER_TITLE")}
          </Button>
        }
      />

      {filterItems.length > 0 ? (
        <Button variant="outline" onClick={() => onChange({})}>
          <FunnelXIcon className="size-4" />
          {t("team:TEAM_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}
