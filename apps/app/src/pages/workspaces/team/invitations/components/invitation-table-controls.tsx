import { FunnelX, ListFilter, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { Button } from "@arclayer/ui/button";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import type { InvitationSort, InvitationTableFilters, InvitationTableMode } from "../types";

type RoleOption = { code: string; name: string };
type FilterValue = string;

const OPERATOR_IS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function toFilters(value: InvitationTableFilters): Filter<FilterValue>[] {
  const filters: Filter<FilterValue>[] = [];
  if (value.roleCode) filters.push(createFilter("roleCode", "is", [value.roleCode]));
  if (value.status) filters.push(createFilter("status", "is", [value.status]));
  return filters;
}

function fromFilters(filters: Filter<FilterValue>[]): InvitationTableFilters {
  const value: InvitationTableFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (!first) continue;
    if (filter.field === "roleCode") value.roleCode = first;
    if (filter.field === "status") value.status = first as InvitationTableFilters["status"];
  }
  return value;
}

function orderingOptions(mode: InvitationTableMode, t: (key: string) => string) {
  const shared: Array<{ value: InvitationSort; label: string }> = [
    { value: "-created_at", label: t("team:TEAM_INVITATIONS_ORDER_NEWEST") },
    { value: "created_at", label: t("team:TEAM_INVITATIONS_ORDER_OLDEST") },
    { value: "expires_at", label: t("team:TEAM_INVITATIONS_ORDER_EXPIRES_SOON") },
    { value: "-expires_at", label: t("team:TEAM_INVITATIONS_ORDER_EXPIRES_LATE") },
  ];
  if (mode === "links") {
    shared.push(
      { value: "-uses_count", label: t("team:TEAM_INVITATIONS_ORDER_USES_MOST") },
      { value: "uses_count", label: t("team:TEAM_INVITATIONS_ORDER_USES_LEAST") },
    );
  } else {
    shared.push(
      { value: "email", label: t("team:TEAM_SORT_EMAIL_AZ") },
      { value: "-email", label: t("team:TEAM_SORT_EMAIL_ZA") },
    );
  }
  return shared;
}

export function InvitationTableControls(props: {
  mode: InvitationTableMode;
  value: InvitationTableFilters;
  onChange: (value: InvitationTableFilters) => void;
  ordering: InvitationSort;
  onOrderingChange: (value: InvitationSort) => void;
  roleManagementAvailable: boolean;
  roles: readonly RoleOption[];
}) {
  const { t } = useTranslation(["team", "common"]);
  const filters = useMemo(() => toFilters(props.value), [props.value]);
  const operators = useMemo(
    () => OPERATOR_IS.map((item) => ({ value: item.value, label: t(item.labelKey) })),
    [t],
  );
  const fields = useMemo<FilterFieldConfig<FilterValue>[]>(() => {
    const result: FilterFieldConfig<FilterValue>[] = [];
    if (props.roleManagementAvailable) {
      result.push({
        key: "roleCode",
        label: t("team:TEAM_INVITATIONS_FILTER_ROLE"),
        type: "select",
        icon: <ShieldCheck className="size-4" />,
        searchable: true,
        operators,
        options: props.roles.map((role) => ({ value: role.code, label: role.name || role.code })),
      });
    }
    if (props.mode === "links") {
      result.push({
        key: "status",
        label: t("team:TEAM_INVITE_LINKS_FILTER_STATUS"),
        type: "select",
        searchable: false,
        operators,
        options: [
          { value: "active", label: t("team:TEAM_INVITE_LINK_STATUS_ACTIVE") },
          { value: "disabled", label: t("team:TEAM_INVITE_LINK_STATUS_DISABLED") },
          { value: "expired", label: t("team:TEAM_INVITE_LINK_STATUS_EXPIRED") },
          { value: "exhausted", label: t("team:TEAM_INVITE_LINK_STATUS_EXHAUSTED") },
        ],
      });
    }
    return result;
  }, [operators, props.mode, props.roleManagementAvailable, props.roles, t]);
  const options = useMemo(() => orderingOptions(props.mode, t), [props.mode, t]);
  const defaultFilters: InvitationTableFilters = props.mode === "links" ? { status: "active" } : {};
  const hasOverrides =
    filters.length !== (props.mode === "links" ? 1 : 0) ||
    props.value.status !== defaultFilters.status ||
    (props.roleManagementAvailable && Boolean(props.value.roleCode)) ||
    props.ordering !== "-created_at";

  return (
    <>
      <Select
        value={props.ordering}
        onValueChange={(value) => props.onOrderingChange(value as InvitationSort)}
      >
        <SelectTrigger className="w-52" aria-label={t("team:TEAM_INVITATIONS_ORDER_LABEL")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" position="popper">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Filters
        filters={filters}
        fields={fields}
        onChange={(next) => props.onChange(fromFilters(next))}
        i18n={buildReuiFilterI18n(t, t("team:TEAM_INVITATIONS_FILTER_TITLE"))}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline" aria-label={t("team:TEAM_INVITATIONS_FILTER_TITLE")}>
            <ListFilter className="size-4" />
          </Button>
        }
      />
      {hasOverrides ? (
        <Button
          variant="outline"
          onClick={() => {
            props.onChange(defaultFilters);
            props.onOrderingChange("-created_at");
          }}
        >
          <FunnelX className="size-4" />
          {t("team:TEAM_INVITATIONS_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}
