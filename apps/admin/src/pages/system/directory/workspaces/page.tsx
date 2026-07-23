import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef, type Header, type SortingState } from "@tanstack/react-table";
import {
  Archive,
  CalendarRange,
  CircleDollarSign,
  Clock3,
  Coins,
  CreditCard,
  Database,
  Eye,
  FunnelX,
  LayoutTemplate,
  ListFilter,
  MoreVertical,
  Palette,
  Pencil,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
  UserRound,
} from "lucide-react";

import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import {
  buildFiltersFromOperatorAwareState,
  buildOperatorAwareFilterState,
  resolveOperatorAwareFieldFilter,
  summarizeOperatorAwareFieldFilter,
  type OperatorAwareFilterState,
} from "@/components/common/reui-filter-state";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import type { SystemDirectoryWorkspace } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import { DateTimeRangeField } from "@arclayer/ui/date-time-range-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Filters, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import {
  ConfirmDirectoryActionDialog,
  DirectoryIconDialog,
  EditWorkspaceDialog,
  WorkspaceRoleDialog,
  type DirectoryIconValues,
} from "../governance-dialogs";
import { DirectoryEntityIdentityCell } from "../entity-identity-cell";
import {
  createActionsColumn,
  createCustomColumn,
  createDateColumn,
  createSelectionColumn,
  createTruncatedTextColumn,
  createOwnerCell,
  renderCountTag,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import {
  useSystemDirectoryUserOptions,
  useSystemDirectoryWorkspaceGovernance,
  useSystemDirectoryWorkspaceRoleOptions,
  useSystemDirectoryWorkspacesTable,
} from "../hooks";
import {
  findDirectoryRestriction,
  getDirectoryRestrictionRevision,
  isDirectoryRestrictionActive,
} from "../restriction-state";
import {
  WorkspaceOperationsDrawer,
  type WorkspaceOperationsTab,
} from "./workspace-operations-drawer";
import { useSystemCommercePlanCatalog } from "./workspace-operations-hooks";

type WorkspaceFilterField =
  | "isArchived"
  | "isActive"
  | "ownerUserId"
  | "planCode"
  | "subscriptionStatus"
  | "commerceRisk"
  | "createdAt"
  | "activityAt";
type WorkspaceFilterValue = string;
export type WorkspaceSortValue =
  | "-created_at"
  | "created_at"
  | "name"
  | "-name"
  | "member_count"
  | "-member_count"
  | "project_count"
  | "-project_count"
  | "plan"
  | "-plan"
  | "credit_risk"
  | "-credit_risk"
  | "renewal_at"
  | "-renewal_at"
  | "activity_at"
  | "-activity_at";
export type SystemDirectoryWorkspacesSearch = {
  q?: string;
  ordering?: WorkspaceSortValue;
  isArchived?: boolean;
  isActive?: boolean;
  ownerUserId?: string;
  planCode?: string;
  subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled";
  commerceRisk?: "healthy" | "attention_required" | "data_missing";
  createdFrom?: string;
  createdTo?: string;
  activityFrom?: string;
  activityTo?: string;
};
type ConfirmActionKind = "archive" | "restore" | "disable" | "enable" | "delete";

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;
const DEFAULT_WORKSPACE_SORT: WorkspaceSortValue = "-created_at";
const WORKSPACE_SORT_OPTIONS: ReadonlyArray<{ value: WorkspaceSortValue; labelKey: string }> = [
  { value: "-created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_NEWEST" },
  { value: "created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_OLDEST" },
  { value: "name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_NAME_AZ" },
  { value: "-name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_NAME_ZA" },
  { value: "-member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_HIGH" },
  { value: "member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_LOW" },
  { value: "-project_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_PROJECTS_HIGH" },
  { value: "plan", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_PLAN_ASC" },
  { value: "-plan", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_PLAN_DESC" },
  {
    value: "-credit_risk",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_RISK_HIGH",
  },
  {
    value: "credit_risk",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_RISK_LOW",
  },
  {
    value: "renewal_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_RENEWAL_EARLY",
  },
  {
    value: "-renewal_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_RENEWAL_LATE",
  },
  {
    value: "-activity_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_ACTIVITY_RECENT",
  },
  {
    value: "activity_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SORT_ACTIVITY_OLD",
  },
] as const;

function toWorkspaceSortValue(sorting: SortingState): WorkspaceSortValue | null {
  const [first] = sorting;
  if (!first) return null;
  if (first.id === "workspace") return first.desc ? "-name" : "name";
  if (first.id === "members") return first.desc ? "-member_count" : "member_count";
  if (first.id === "projects") return first.desc ? "-project_count" : "project_count";
  if (first.id === "plan") return first.desc ? "-plan" : "plan";
  if (first.id === "credits") return first.desc ? "-credit_risk" : "credit_risk";
  if (first.id === "renewalAt") return first.desc ? "-renewal_at" : "renewal_at";
  if (first.id === "activityAt") return first.desc ? "-activity_at" : "activity_at";
  if (first.id === "createdAt") return first.desc ? "-created_at" : "created_at";
  return null;
}

function toTableSorting(value: WorkspaceSortValue): SortingState {
  if (value === "created_at") return [{ id: "createdAt", desc: false }];
  if (value === "name") return [{ id: "workspace", desc: false }];
  if (value === "-name") return [{ id: "workspace", desc: true }];
  if (value === "member_count") return [{ id: "members", desc: false }];
  if (value === "-member_count") return [{ id: "members", desc: true }];
  if (value === "project_count") return [{ id: "projects", desc: false }];
  if (value === "-project_count") return [{ id: "projects", desc: true }];
  if (value === "plan") return [{ id: "plan", desc: false }];
  if (value === "-plan") return [{ id: "plan", desc: true }];
  if (value === "credit_risk") return [{ id: "credits", desc: false }];
  if (value === "-credit_risk") return [{ id: "credits", desc: true }];
  if (value === "renewal_at") return [{ id: "renewalAt", desc: false }];
  if (value === "-renewal_at") return [{ id: "renewalAt", desc: true }];
  if (value === "activity_at") return [{ id: "activityAt", desc: false }];
  if (value === "-activity_at") return [{ id: "activityAt", desc: true }];
  return [];
}

function toFilters(filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>) {
  return buildFiltersFromOperatorAwareState(filters);
}

function fromFilters(filters: Filter<WorkspaceFilterValue>[]) {
  return buildOperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>(filters);
}

function firstFilterValue(
  filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>,
  field: WorkspaceFilterField,
) {
  const value = filters[field]?.values[0];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanFilterValue(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function rangeFilterValues(
  filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>,
  field: WorkspaceFilterField,
) {
  const [start, end] = filters[field]?.values ?? [];
  return {
    start: typeof start === "string" && start ? start : undefined,
    end: typeof end === "string" && end ? end : undefined,
  };
}

function formatDateRange(values: WorkspaceFilterValue[]) {
  return values.filter(Boolean).join(" – ") || "-";
}

function initialWorkspaceFilters(search: SystemDirectoryWorkspacesSearch) {
  const filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue> = {};
  if (search.isArchived !== undefined) {
    filters.isArchived = { operator: "is", values: [String(search.isArchived)] };
  }
  if (search.isActive !== undefined) {
    filters.isActive = { operator: "is", values: [String(search.isActive)] };
  }
  if (search.ownerUserId) {
    filters.ownerUserId = { operator: "is", values: [search.ownerUserId] };
  }
  const set = (field: WorkspaceFilterField, value: string | undefined) => {
    if (!value) return;
    filters[field] = { operator: "is", values: [value] };
  };
  const setRange = (field: WorkspaceFilterField, start?: string, end?: string) => {
    if (!start && !end) return;
    filters[field] = { operator: "is", values: [start ?? "", end ?? ""] };
  };
  set("planCode", search.planCode);
  set("subscriptionStatus", search.subscriptionStatus);
  set("commerceRisk", search.commerceRisk);
  setRange("createdAt", search.createdFrom, search.createdTo);
  setRange("activityAt", search.activityFrom, search.activityTo);
  return filters;
}

function summarizeWorkspaceFilter(
  filters: OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>,
  field: WorkspaceFilterField,
  formatValue?: (value: WorkspaceFilterValue) => string | undefined,
) {
  return summarizeOperatorAwareFieldFilter(resolveOperatorAwareFieldFilter(filters, field), {
    valueFormatter: formatValue,
    maxValues: 1,
  });
}

export function SystemDirectoryWorkspacesPage(
  props: {
    search?: SystemDirectoryWorkspacesSearch;
    onSearchChange?: (search: SystemDirectoryWorkspacesSearch) => void;
  } = {},
) {
  const { t, i18n } = useTranslation(["common", "settings", "commerce"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const governance = useSystemDirectoryWorkspaceGovernance();
  const userOptions = useSystemDirectoryUserOptions();
  const planCatalogQuery = useSystemCommercePlanCatalog(true);
  const plans = planCatalogQuery.data?.items ?? [];
  const [filters, setFilters] = useState<
    OperatorAwareFilterState<WorkspaceFilterField, WorkspaceFilterValue>
  >(() => initialWorkspaceFilters(props.search ?? {}));
  const [editTarget, setEditTarget] = useState<SystemDirectoryWorkspace | null>(null);
  const [iconTarget, setIconTarget] = useState<SystemDirectoryWorkspace | null>(null);
  const [roleTarget, setRoleTarget] = useState<SystemDirectoryWorkspace | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<{
    workspace: SystemDirectoryWorkspace;
    tab: WorkspaceOperationsTab;
    adjustPlan?: boolean;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: ConfirmActionKind;
    workspaces: SystemDirectoryWorkspace[];
  } | null>(null);
  const roleOptions = useSystemDirectoryWorkspaceRoleOptions(roleTarget?.workspaceId ?? null);

  const resolveFilterLabel = useCallback(
    (field: WorkspaceFilterField, value: string) => {
      if (field === "isArchived") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE");
      }
      if (field === "isActive") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED");
      }
      if (field === "ownerUserId") {
        const owner = userOptions.users.find((user) => user.userId === value);
        return owner?.displayName?.trim() || owner?.username || value;
      }
      if (field === "planCode") {
        return plans.find((plan) => plan.code === value)?.name ?? value;
      }
      if (field === "subscriptionStatus") {
        const key = {
          active: "SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS_ACTIVE",
          trialing: "SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS_TRIALING",
          past_due: "SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS_PAST_DUE",
          canceled: "SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS_CANCELED",
        }[value];
        return key ? t(`settings:${key}`) : value;
      }
      if (field === "commerceRisk") {
        const key = {
          healthy: "SETTINGS_SYSTEM_DIRECTORY_COMMERCE_RISK_HEALTHY",
          attention_required: "SETTINGS_SYSTEM_DIRECTORY_COMMERCE_RISK_ATTENTION",
          data_missing: "SETTINGS_SYSTEM_DIRECTORY_COMMERCE_RISK_MISSING",
        }[value];
        return key ? t(`settings:${key}`) : value;
      }
      return value;
    },
    [plans, t, userOptions.users],
  );

  const columns = useMemo<Array<ColumnDef<SystemDirectoryWorkspace, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryWorkspace>(),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE"),
        (row) => (
          <DirectoryEntityIdentityCell
            avatar={
              <WorkspaceAvatar
                name={row.name}
                size={28}
                iconMode={row.iconMode}
                iconColor={row.iconColor}
                iconGlyph={row.iconGlyph}
                iconEmoji={row.iconEmoji}
                assetRef={row.iconUrl}
              />
            }
            name={row.name}
          />
        ),
        { id: "workspace", sortKey: "name", kind: "primary", size: 320, minSize: 280 },
      ),
      createTruncatedTextColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_DESCRIPTION"),
        (row) => row.description,
        { id: "description", size: 260, minSize: 220 },
      ),
      createOwnerCell<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        { size: 280, minSize: 240 },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PLAN"),
        (row) => {
          const commerce = row.commerce;
          const status = commerce.subscriptionStatus;
          if (!commerce.planName || !status) {
            return (
              <div className="flex min-w-0 flex-col items-start gap-1">
                <span className="text-footnote font-medium text-label-primary">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_UNKNOWN")}
                </span>
                {renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_COMMERCE_RISK_MISSING"), {
                  tone: "default",
                  icon: Database,
                })}
              </div>
            );
          }
          const statusTone =
            status === "active"
              ? "green"
              : status === "trialing"
                ? "blue"
                : status === "past_due"
                  ? "gold"
                  : "red";
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span className="max-w-48 truncate text-footnote font-medium text-label-primary">
                {commerce.planName}
              </span>
              {renderTag(resolveFilterLabel("subscriptionStatus", status), {
                tone: statusTone,
              })}
            </div>
          );
        },
        { id: "plan", sortKey: "plan", size: 200, minSize: 180 },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREDITS"),
        (row) => {
          const credits = row.commerce.credits;
          if (!credits) {
            return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_COMMERCE_RISK_MISSING"), {
              tone: "default",
              icon: Database,
            });
          }
          const isAttention = row.commerce.risk === "attention_required";
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span className="text-footnote font-medium tabular-nums text-label-primary">
                {t("commerce:CREDITS_AVAILABLE", { count: number.format(credits.available) })}
              </span>
              <span className="text-caption tabular-nums text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_CREDITS_BALANCE_RESERVED", {
                  balance: number.format(credits.balance),
                  reserved: number.format(credits.reserved),
                })}
              </span>
              {isAttention
                ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_COMMERCE_RISK_ATTENTION"), {
                    tone: "gold",
                    icon: TriangleAlert,
                  })
                : null}
            </div>
          );
        },
        { id: "credits", sortKey: "credit_risk", size: 230, minSize: 210 },
      ),
      createDateColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_RENEWAL_AT"),
        (row) => row.commerce.renewalAt,
        dateTime,
        { id: "renewalAt", sortKey: "renewal_at" },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderCountTag(row.memberCount),
        { id: "members", sortKey: "member_count" },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS"),
        (row) => renderCountTag(row.projectCount),
        { id: "projects", sortKey: "project_count" },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ARCHIVED"),
        (row) => {
          const isArchived = isDirectoryRestrictionActive(row, "workspace_archived");
          const isSuspended = isDirectoryRestrictionActive(row, "workspace_suspended");
          return isArchived
            ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED"), {
                tone: "gold",
                icon: Archive,
              })
            : renderTag(
                isSuspended
                  ? t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED")
                  : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE"),
                {
                  tone: isSuspended ? "red" : "green",
                  icon: isSuspended ? PowerOff : LayoutTemplate,
                },
              );
        },
        { id: "state" },
      ),
      createDateColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ACTIVITY_AT"),
        (row) => row.lastActivityAt,
        dateTime,
        { id: "activityAt", sortKey: "activity_at" },
      ),
      createDateColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
      createActionsColumn<SystemDirectoryWorkspace>({
        size: 196,
        minSize: 184,
        renderActions: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setDetailsTarget({ workspace: row, tab: "overview" });
              }}
            >
              <Eye className="size-3.5" />
              {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DETAILS")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_MORE")}
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuIconItem
                  icon={<CreditCard className="size-4" />}
                  onSelect={() => setDetailsTarget({ workspace: row, tab: "billing" })}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_VIEW_BILLING")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={<CircleDollarSign className="size-4" />}
                  onSelect={() =>
                    setDetailsTarget({ workspace: row, tab: "billing", adjustPlan: true })
                  }
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ADJUST_PLAN")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<Pencil className="size-4" />}
                  onSelect={() => setEditTarget(row)}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_WORKSPACE")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={<Palette className="size-4" />}
                  onSelect={() => setIconTarget(row)}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_CHANGE_ICON")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<ShieldCheck className="size-4" />}
                  onSelect={() => setRoleTarget(row)}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_MANAGE_ROLES")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={
                    isDirectoryRestrictionActive(row, "workspace_archived") ? (
                      <Undo2 className="size-4" />
                    ) : (
                      <Archive className="size-4" />
                    )
                  }
                  onSelect={() =>
                    setConfirmAction({
                      kind: isDirectoryRestrictionActive(row, "workspace_archived")
                        ? "restore"
                        : "archive",
                      workspaces: [row],
                    })
                  }
                >
                  {isDirectoryRestrictionActive(row, "workspace_archived")
                    ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE")
                    : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={
                    isDirectoryRestrictionActive(row, "workspace_suspended") ? (
                      <Power className="size-4" />
                    ) : (
                      <PowerOff className="size-4" />
                    )
                  }
                  variant={
                    isDirectoryRestrictionActive(row, "workspace_suspended")
                      ? "default"
                      : "destructive"
                  }
                  onSelect={() =>
                    setConfirmAction({
                      kind: isDirectoryRestrictionActive(row, "workspace_suspended")
                        ? "enable"
                        : "disable",
                      workspaces: [row],
                    })
                  }
                >
                  {isDirectoryRestrictionActive(row, "workspace_suspended")
                    ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE")
                    : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<Trash2 className="size-4" />}
                  variant="destructive"
                  onSelect={() => setConfirmAction({ kind: "delete", workspaces: [row] })}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_WORKSPACE")}
                </DropdownMenuIconItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [dateTime, number, resolveFilterLabel, t],
  );

  const extraQuery = useMemo(() => {
    const createdRange = rangeFilterValues(filters, "createdAt");
    const activityRange = rangeFilterValues(filters, "activityAt");
    return {
      isArchived: booleanFilterValue(firstFilterValue(filters, "isArchived")),
      isActive: booleanFilterValue(firstFilterValue(filters, "isActive")),
      ownerUserId: firstFilterValue(filters, "ownerUserId"),
      planCode: firstFilterValue(filters, "planCode"),
      subscriptionStatus: firstFilterValue(filters, "subscriptionStatus"),
      commerceRisk: firstFilterValue(filters, "commerceRisk"),
      createdFrom: createdRange.start,
      createdTo: createdRange.end,
      activityFrom: activityRange.start,
      activityTo: activityRange.end,
    };
  }, [filters]);
  const tableHook = useSystemDirectoryWorkspacesTable(columns, extraQuery, {
    q: props.search?.q,
    sorting: toTableSorting(props.search?.ordering ?? DEFAULT_WORKSPACE_SORT),
  });
  const activeSort = toWorkspaceSortValue(tableHook.sorting) ?? DEFAULT_WORKSPACE_SORT;
  const requestSearch = tableHook.requestParams?.q ?? "";

  useEffect(() => {
    props.onSearchChange?.({
      q: requestSearch || undefined,
      ordering: activeSort === DEFAULT_WORKSPACE_SORT ? undefined : activeSort,
      isArchived: extraQuery.isArchived,
      isActive: extraQuery.isActive,
      ownerUserId: extraQuery.ownerUserId,
      planCode: extraQuery.planCode,
      subscriptionStatus:
        extraQuery.subscriptionStatus as SystemDirectoryWorkspacesSearch["subscriptionStatus"],
      commerceRisk: extraQuery.commerceRisk as SystemDirectoryWorkspacesSearch["commerceRisk"],
      createdFrom: extraQuery.createdFrom,
      createdTo: extraQuery.createdTo,
      activityFrom: extraQuery.activityFrom,
      activityTo: extraQuery.activityTo,
    });
  }, [activeSort, extraQuery, props.onSearchChange, requestSearch]);
  const filterItems = useMemo(() => toFilters(filters), [filters]);
  const reuiI18n = useMemo(
    () => buildReuiFilterI18n(t, t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_FILTER_TITLE")),
    [t],
  );
  const filterFields = useMemo<FilterFieldConfig<WorkspaceFilterValue>[]>(
    () => [
      {
        key: "ownerUserId",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        type: "select",
        icon: <UserRound className="size-4" />,
        searchable: true,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: userOptions.users.map((user) => ({
          value: user.userId,
          label: user.displayName?.trim() || user.username,
        })),
      },
      {
        key: "planCode",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_PLAN"),
        type: "select",
        icon: <CreditCard className="size-4" />,
        searchable: true,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: plans.map((plan) => ({ value: plan.code, label: plan.name })),
      },
      {
        key: "subscriptionStatus",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS"),
        type: "select",
        icon: <CircleDollarSign className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: ["active", "trialing", "past_due", "canceled"].map((value) => ({
          value,
          label: resolveFilterLabel("subscriptionStatus", value),
        })),
      },
      {
        key: "commerceRisk",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_COMMERCE_RISK"),
        type: "select",
        icon: <Coins className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: ["healthy", "attention_required", "data_missing"].map((value) => ({
          value,
          label: resolveFilterLabel("commerceRisk", value),
        })),
      },
      {
        key: "createdAt",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_CREATED_AT"),
        type: "custom",
        icon: <CalendarRange className="size-4" />,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        customRenderer: ({ values, onChange }) => (
          <div className="min-w-[18rem]">
            <DateTimeRangeField
              startValue={values[0] || undefined}
              endValue={values[1] || undefined}
              startAriaLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_CREATED_AT")}
              endAriaLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_CREATED_AT")}
              startPlaceholder={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RANGE_START")}
              endPlaceholder={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) => onChange([startValue ?? "", endValue ?? ""])}
            />
          </div>
        ),
        customValueRenderer: formatDateRange,
      },
      {
        key: "activityAt",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_ACTIVITY_AT"),
        type: "custom",
        icon: <Clock3 className="size-4" />,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        customRenderer: ({ values, onChange }) => (
          <div className="min-w-[18rem]">
            <DateTimeRangeField
              startValue={values[0] || undefined}
              endValue={values[1] || undefined}
              startAriaLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_ACTIVITY_AT")}
              endAriaLabel={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_ACTIVITY_AT")}
              startPlaceholder={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RANGE_START")}
              endPlaceholder={t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) => onChange([startValue ?? "", endValue ?? ""])}
            />
          </div>
        ),
        customValueRenderer: formatDateRange,
      },
      {
        key: "isArchived",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_ARCHIVE_STATE"),
        type: "select",
        icon: <Archive className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          { value: "true", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED") },
          { value: "false", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE") },
        ],
      },
      {
        key: "isActive",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_STATE"),
        type: "select",
        icon: <Power className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          { value: "true", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE") },
          { value: "false", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED") },
        ],
      },
    ],
    [plans, resolveFilterLabel, t, userOptions.users],
  );

  const resolveColumnFilterAction = useCallback(
    (header: Header<SystemDirectoryWorkspace, unknown>) => {
      if (header.column.id === "owner") {
        return {
          active: Boolean(filters.ownerUserId),
          summary: summarizeWorkspaceFilter(filters, "ownerUserId", (value) =>
            resolveFilterLabel("ownerUserId", value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "state") {
        if (filters.isArchived) {
          return {
            active: true,
            summary: summarizeWorkspaceFilter(filters, "isArchived", (value) =>
              resolveFilterLabel("isArchived", value),
            ),
            onSelect: () => void 0,
          };
        }
        return {
          active: Boolean(filters.isActive),
          summary: summarizeWorkspaceFilter(filters, "isActive", (value) =>
            resolveFilterLabel("isActive", value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "plan") {
        const field = filters.planCode ? "planCode" : "subscriptionStatus";
        return {
          active: Boolean(filters.planCode || filters.subscriptionStatus),
          summary: summarizeWorkspaceFilter(filters, field, (value) =>
            resolveFilterLabel(field, value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "credits") {
        return {
          active: Boolean(filters.commerceRisk),
          summary: summarizeWorkspaceFilter(filters, "commerceRisk", (value) =>
            resolveFilterLabel("commerceRisk", value),
          ),
          onSelect: () => void 0,
        };
      }
      return undefined;
    },
    [filters, resolveFilterLabel],
  );

  const hasOverrides = filterItems.length > 0 || activeSort !== DEFAULT_WORKSPACE_SORT;
  const toolbarLeading = useMemo(
    () => (
      <>
        <Select
          value={activeSort}
          onValueChange={(next) => tableHook.setSorting(toTableSorting(next as WorkspaceSortValue))}
        >
          <SelectTrigger className="w-[14rem] min-w-[14rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            {WORKSPACE_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Filters
          filters={filterItems}
          fields={filterFields}
          onChange={(next) => setFilters(fromFilters(next))}
          i18n={reuiI18n}
          allowMultiple={false}
          enableShortcut
          shortcutKey="f"
          shortcutLabel="F"
          trigger={
            <Button variant="outline" disabled={tableHook.isLoading}>
              <ListFilter className="size-4" />
            </Button>
          }
        />
        {hasOverrides ? (
          <Button
            variant="outline"
            onClick={() => {
              setFilters({});
              tableHook.setSorting(toTableSorting(DEFAULT_WORKSPACE_SORT));
            }}
          >
            <FunnelX className="size-4" />
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RESET")}
          </Button>
        ) : null}
      </>
    ),
    [activeSort, filterFields, filterItems, hasOverrides, reuiI18n, t, tableHook],
  );

  const selectedWorkspaces = tableHook.table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedArchived = selectedWorkspaces.filter((item) =>
    isDirectoryRestrictionActive(item, "workspace_archived"),
  );
  const selectedUnarchived = selectedWorkspaces.filter(
    (item) => !isDirectoryRestrictionActive(item, "workspace_archived"),
  );
  const selectedActive = selectedWorkspaces.filter(
    (item) => !isDirectoryRestrictionActive(item, "workspace_suspended"),
  );
  const selectedInactive = selectedWorkspaces.filter((item) =>
    isDirectoryRestrictionActive(item, "workspace_suspended"),
  );
  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    const count = confirmAction.workspaces.length;
    const many = count > 1;
    if (confirmAction.kind === "archive") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ARCHIVE_WORKSPACE_TITLE"),
        description: many
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ARCHIVE_WORKSPACE_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ARCHIVE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE"),
        variant: "default" as const,
      };
    }
    if (confirmAction.kind === "restore") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_RESTORE_WORKSPACE_TITLE"),
        description: many
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_RESTORE_WORKSPACE_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_RESTORE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE"),
        variant: "default" as const,
      };
    }
    if (confirmAction.kind === "disable") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_WORKSPACE_TITLE"),
        description: many
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_WORKSPACE_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "delete") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_WORKSPACE_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_WORKSPACE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_WORKSPACE"),
        variant: "destructive" as const,
        confirmName: {
          expected: confirmAction.workspaces[0]?.name ?? "",
          label: t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
          placeholder: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_PLACEHOLDER"),
          mismatchMessage: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"),
        },
      };
    }
    return {
      title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_WORKSPACE_TITLE"),
      description: many
        ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_WORKSPACE_DESC_MANY")
        : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_WORKSPACE_DESC_ONE"),
      confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE"),
      variant: "default" as const,
    };
  }, [confirmAction, t]);
  const confirmRestriction = useMemo(() => {
    if (!confirmAction || confirmAction.kind === "delete") return undefined;
    const restrictionType =
      confirmAction.kind === "archive" || confirmAction.kind === "restore"
        ? ("workspace_archived" as const)
        : ("workspace_suspended" as const);
    return {
      mode:
        confirmAction.kind === "archive" || confirmAction.kind === "disable"
          ? ("enforce" as const)
          : ("lift" as const),
      current: findDirectoryRestriction(confirmAction.workspaces[0]!, restrictionType),
    };
  }, [confirmAction]);

  const confirmPending =
    governance.archiveWorkspacesMutation.isPending ||
    governance.restoreWorkspacesMutation.isPending ||
    governance.disableWorkspacesMutation.isPending ||
    governance.enableWorkspacesMutation.isPending ||
    governance.deleteWorkspacesMutation.isPending;
  const rolePending =
    governance.updateWorkspaceDefaultRoleMutation.isPending ||
    governance.assignWorkspaceRoleMutation.isPending;

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SEARCH"),
        }}
        toolbarLeading={toolbarLeading}
        resolveColumnFilterAction={resolveColumnFilterAction}
        onRowClick={(workspace) => setDetailsTarget({ workspace, tab: "overview" })}
        bulkActions={[
          {
            key: "archive",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE"),
            icon: <Archive className="size-4" />,
            disabled: selectedUnarchived.length === 0,
            onClick: () => setConfirmAction({ kind: "archive", workspaces: selectedUnarchived }),
          },
          {
            key: "restore",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE"),
            icon: <Undo2 className="size-4" />,
            disabled: selectedArchived.length === 0,
            onClick: () => setConfirmAction({ kind: "restore", workspaces: selectedArchived }),
          },
          {
            key: "disable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE"),
            icon: <PowerOff className="size-4" />,
            disabled: selectedActive.length === 0,
            onClick: () => setConfirmAction({ kind: "disable", workspaces: selectedActive }),
          },
          {
            key: "enable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE"),
            icon: <Power className="size-4" />,
            disabled: selectedInactive.length === 0,
            onClick: () => setConfirmAction({ kind: "enable", workspaces: selectedInactive }),
          },
        ]}
      />
      <WorkspaceOperationsDrawer
        workspace={detailsTarget?.workspace ?? null}
        initialTab={detailsTarget?.tab}
        initialPlanAdjustmentOpen={detailsTarget?.adjustPlan}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
      />
      <EditWorkspaceDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        workspace={editTarget}
        pending={governance.updateWorkspaceMutation.isPending}
        onSubmit={async (values) => {
          if (!editTarget) return;
          await governance.updateWorkspaceMutation.mutateAsync({
            workspaceId: editTarget.workspaceId,
            name: values.name,
            description: values.description,
          });
        }}
      />
      <DirectoryIconDialog
        open={Boolean(iconTarget)}
        onOpenChange={(open) => {
          if (!open) setIconTarget(null);
        }}
        kind="workspace"
        entity={iconTarget}
        pending={governance.updateWorkspaceMutation.isPending}
        onSubmit={async (values: DirectoryIconValues) => {
          if (!iconTarget) return;
          await governance.updateWorkspaceMutation.mutateAsync({
            workspaceId: iconTarget.workspaceId,
            ...values,
          });
        }}
      />
      <WorkspaceRoleDialog
        open={Boolean(roleTarget)}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
        workspace={roleTarget}
        roles={roleOptions.roles}
        defaultRoleCode={roleOptions.defaultRoleCode}
        loading={roleOptions.rolesQuery.isLoading || roleOptions.rolePolicyQuery.isLoading}
        pending={rolePending}
        onUpdateDefaultRole={async (roleCode) => {
          if (!roleTarget) return;
          await governance.updateWorkspaceDefaultRoleMutation.mutateAsync({
            workspaceId: roleTarget.workspaceId,
            defaultRoleCode: roleCode,
          });
        }}
        onAssignRole={async (values) => {
          if (!roleTarget) return;
          await governance.assignWorkspaceRoleMutation.mutateAsync({
            workspaceId: roleTarget.workspaceId,
            roleCode: values.roleCode,
            confirmName: values.confirmName,
          });
        }}
      />
      {confirmConfig ? (
        <ConfirmDirectoryActionDialog
          open={Boolean(confirmAction)}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmConfig.title}
          description={confirmConfig.description}
          confirmLabel={confirmConfig.confirmLabel}
          variant={confirmConfig.variant}
          pending={confirmPending}
          confirmName={confirmConfig.confirmName}
          restriction={confirmRestriction}
          onConfirm={async (values) => {
            if (!confirmAction) return;
            const transition = values.transition;
            if (confirmAction.kind === "archive") {
              if (!transition) throw new Error("ACCESS_RESTRICTION_TRANSITION_REQUIRED");
              await governance.archiveWorkspacesMutation.mutateAsync({
                targets: confirmAction.workspaces.map((workspace) => ({
                  id: workspace.workspaceId,
                  expectedRevision: getDirectoryRestrictionRevision(
                    workspace,
                    "workspace_archived",
                  ),
                })),
                transition,
              });
              return;
            }
            if (confirmAction.kind === "restore") {
              if (!transition) throw new Error("ACCESS_RESTRICTION_TRANSITION_REQUIRED");
              await governance.restoreWorkspacesMutation.mutateAsync({
                targets: confirmAction.workspaces.map((workspace) => ({
                  id: workspace.workspaceId,
                  expectedRevision: getDirectoryRestrictionRevision(
                    workspace,
                    "workspace_archived",
                  ),
                })),
                transition,
              });
              return;
            }
            if (confirmAction.kind === "disable") {
              if (!transition) throw new Error("ACCESS_RESTRICTION_TRANSITION_REQUIRED");
              await governance.disableWorkspacesMutation.mutateAsync({
                targets: confirmAction.workspaces.map((workspace) => ({
                  id: workspace.workspaceId,
                  expectedRevision: getDirectoryRestrictionRevision(
                    workspace,
                    "workspace_suspended",
                  ),
                })),
                transition,
              });
              return;
            }
            if (confirmAction.kind === "delete") {
              await governance.deleteWorkspacesMutation.mutateAsync({
                workspaceId: confirmAction.workspaces[0]!.workspaceId,
                confirmName: values.confirmName,
              });
              return;
            }
            if (!transition) throw new Error("ACCESS_RESTRICTION_TRANSITION_REQUIRED");
            await governance.enableWorkspacesMutation.mutateAsync({
              targets: confirmAction.workspaces.map((workspace) => ({
                id: workspace.workspaceId,
                expectedRevision: getDirectoryRestrictionRevision(workspace, "workspace_suspended"),
              })),
              transition,
            });
          }}
        />
      ) : null}
    </>
  );
}
