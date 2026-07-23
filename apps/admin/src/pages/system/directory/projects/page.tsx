import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { type ColumnDef, type Header, type SortingState } from "@tanstack/react-table";
import {
  CalendarRange,
  ChartNoAxesCombined,
  Clock3,
  Database,
  ExternalLink,
  Eye,
  FunnelX,
  Gauge,
  Globe2,
  LayoutTemplate,
  ListFilter,
  MoreVertical,
  Palette,
  Pencil,
  Power,
  PowerOff,
  Rocket,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import { ProjectAvatar } from "@/components/common/project-avatar";
import {
  buildFiltersFromOperatorAwareState,
  buildOperatorAwareFilterState,
  resolveOperatorAwareFieldFilter,
  summarizeOperatorAwareFieldFilter,
  type OperatorAwareFilterState,
} from "@/components/common/reui-filter-state";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import type { SystemDirectoryProject } from "@arclayer/openapi/admin-types";
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
  EditProjectDialog,
  type DirectoryIconValues,
} from "../governance-dialogs";
import { DirectoryEntityIdentityCell } from "../entity-identity-cell";
import {
  createActionsColumn,
  createCustomColumn,
  createDateColumn,
  createSelectionColumn,
  createOwnerCell,
  renderCountTag,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import {
  useSystemDirectoryProjectGovernance,
  useSystemDirectoryProjectsTable,
  useSystemDirectoryUserOptions,
  useSystemDirectoryWorkspaceOptions,
} from "../hooks";
import {
  findDirectoryRestriction,
  getDirectoryRestrictionRevision,
  isDirectoryRestrictionActive,
} from "../restriction-state";
import { ProjectOperationsDrawer, type ProjectOperationsTab } from "./project-operations-drawer";

type ProjectFilterField =
  | "workspaceId"
  | "isActive"
  | "ownerUserId"
  | "runtimeHealth"
  | "domainState"
  | "releaseState"
  | "createdAt"
  | "activityAt";
type ProjectFilterValue = string;
export type ProjectSortValue =
  | "-created_at"
  | "created_at"
  | "name"
  | "-name"
  | "workspace_name"
  | "-workspace_name"
  | "member_count"
  | "-member_count"
  | "activity_at"
  | "-activity_at";
export type SystemDirectoryProjectsSearch = {
  q?: string;
  ordering?: ProjectSortValue;
  workspaceId?: string;
  isActive?: boolean;
  ownerUserId?: string;
  runtimeHealth?: "healthy" | "degraded" | "inactive" | "not_deployed" | "unavailable";
  domainState?: "ready" | "attention_required" | "none";
  releaseState?: "active" | "scheduled" | "published" | "cancelled" | "not_released";
  createdFrom?: string;
  createdTo?: string;
  activityFrom?: string;
  activityTo?: string;
};
type ConfirmActionKind = "disable" | "enable" | "delete";

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;
const DEFAULT_PROJECT_SORT: ProjectSortValue = "-created_at";
const PROJECT_SORT_OPTIONS: ReadonlyArray<{ value: ProjectSortValue; labelKey: string }> = [
  { value: "-created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_NEWEST" },
  { value: "created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_OLDEST" },
  { value: "name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SORT_NAME_AZ" },
  { value: "-name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SORT_NAME_ZA" },
  { value: "workspace_name", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_WORKSPACE_AZ" },
  { value: "-member_count", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_SORT_MEMBERS_HIGH" },
  {
    value: "-activity_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SORT_ACTIVITY_RECENT",
  },
  {
    value: "activity_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SORT_ACTIVITY_OLD",
  },
] as const;

function toProjectSortValue(sorting: SortingState): ProjectSortValue | null {
  const [first] = sorting;
  if (!first) return null;
  if (first.id === "project") return first.desc ? "-name" : "name";
  if (first.id === "workspace") return first.desc ? "-workspace_name" : "workspace_name";
  if (first.id === "members") return first.desc ? "-member_count" : "member_count";
  if (first.id === "activityAt") return first.desc ? "-activity_at" : "activity_at";
  if (first.id === "createdAt") return first.desc ? "-created_at" : "created_at";
  return null;
}

function toTableSorting(value: ProjectSortValue): SortingState {
  if (value === "created_at") return [{ id: "createdAt", desc: false }];
  if (value === "name") return [{ id: "project", desc: false }];
  if (value === "-name") return [{ id: "project", desc: true }];
  if (value === "workspace_name") return [{ id: "workspace", desc: false }];
  if (value === "-workspace_name") return [{ id: "workspace", desc: true }];
  if (value === "member_count") return [{ id: "members", desc: false }];
  if (value === "-member_count") return [{ id: "members", desc: true }];
  if (value === "activity_at") return [{ id: "activityAt", desc: false }];
  if (value === "-activity_at") return [{ id: "activityAt", desc: true }];
  return [];
}

function toFilters(filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>) {
  return buildFiltersFromOperatorAwareState(filters);
}

function fromFilters(filters: Filter<ProjectFilterValue>[]) {
  return buildOperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>(filters);
}

function firstFilterValue(
  filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>,
  field: ProjectFilterField,
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
  filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>,
  field: ProjectFilterField,
) {
  const [start, end] = filters[field]?.values ?? [];
  return {
    start: typeof start === "string" && start ? start : undefined,
    end: typeof end === "string" && end ? end : undefined,
  };
}

function formatDateRange(values: ProjectFilterValue[]) {
  return values.filter(Boolean).join(" – ") || "-";
}

function initialProjectFilters(search: SystemDirectoryProjectsSearch) {
  const filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue> = {};
  if (search.workspaceId) {
    filters.workspaceId = { operator: "is", values: [search.workspaceId] };
  }
  if (search.isActive !== undefined) {
    filters.isActive = { operator: "is", values: [String(search.isActive)] };
  }
  if (search.ownerUserId) {
    filters.ownerUserId = { operator: "is", values: [search.ownerUserId] };
  }
  const set = (field: ProjectFilterField, value: string | undefined) => {
    if (value) filters[field] = { operator: "is", values: [value] };
  };
  const setRange = (field: ProjectFilterField, start?: string, end?: string) => {
    if (start || end) filters[field] = { operator: "is", values: [start ?? "", end ?? ""] };
  };
  set("runtimeHealth", search.runtimeHealth);
  set("domainState", search.domainState);
  set("releaseState", search.releaseState);
  setRange("createdAt", search.createdFrom, search.createdTo);
  setRange("activityAt", search.activityFrom, search.activityTo);
  return filters;
}

function summarizeProjectFilter(
  filters: OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>,
  field: ProjectFilterField,
  formatValue?: (value: ProjectFilterValue) => string | undefined,
) {
  return summarizeOperatorAwareFieldFilter(resolveOperatorAwareFieldFilter(filters, field), {
    valueFormatter: formatValue,
    maxValues: 1,
  });
}

export function SystemDirectoryProjectsPage(
  props: {
    search?: SystemDirectoryProjectsSearch;
    onSearchChange?: (search: SystemDirectoryProjectsSearch) => void;
  } = {},
) {
  const { t, i18n } = useTranslation(["common", "settings"]);
  const navigate = useNavigate();
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
    [locale],
  );
  const governance = useSystemDirectoryProjectGovernance();
  const userOptions = useSystemDirectoryUserOptions();
  const [filters, setFilters] = useState<
    OperatorAwareFilterState<ProjectFilterField, ProjectFilterValue>
  >(() => initialProjectFilters(props.search ?? {}));
  const workspaceOptions = useSystemDirectoryWorkspaceOptions();
  const [editTarget, setEditTarget] = useState<SystemDirectoryProject | null>(null);
  const [iconTarget, setIconTarget] = useState<SystemDirectoryProject | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<{
    project: SystemDirectoryProject;
    tab: ProjectOperationsTab;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: ConfirmActionKind;
    projects: SystemDirectoryProject[];
  } | null>(null);
  const resolveFilterLabel = useCallback(
    (field: ProjectFilterField, value: string) => {
      if (field === "workspaceId") {
        return (
          workspaceOptions.workspaces.find((workspace) => workspace.workspaceId === value)?.name ??
          value
        );
      }
      if (field === "isActive") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED");
      }
      if (field === "ownerUserId") {
        const owner = userOptions.users.find((user) => user.userId === value);
        return owner?.displayName?.trim() || owner?.username || value;
      }
      const labels: Partial<Record<ProjectFilterField, Record<string, string>>> = {
        runtimeHealth: {
          healthy: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_HEALTH_HEALTHY",
          degraded: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_HEALTH_DEGRADED",
          inactive: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_HEALTH_INACTIVE",
          not_deployed: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_HEALTH_NOT_DEPLOYED",
          unavailable: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_HEALTH_UNAVAILABLE",
        },
        domainState: {
          ready: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_DOMAIN_READY",
          attention_required: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_DOMAIN_ATTENTION",
          none: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_DOMAIN_NONE",
        },
        releaseState: {
          active: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_RELEASE_ACTIVE",
          scheduled: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_RELEASE_SCHEDULED",
          published: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_RELEASE_PUBLISHED",
          cancelled: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_RELEASE_CANCELLED",
          not_released: "SETTINGS_SYSTEM_DIRECTORY_PROJECT_RELEASE_NONE",
        },
      };
      const key = labels[field]?.[value];
      if (key) return t(`settings:${key}`);
      return value;
    },
    [t, userOptions.users, workspaceOptions.workspaces],
  );

  const columns = useMemo<Array<ColumnDef<SystemDirectoryProject, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryProject>(),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECT"),
        (row) => (
          <DirectoryEntityIdentityCell
            avatar={
              <ProjectAvatar
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
        { id: "project", sortKey: "name", kind: "primary", size: 300, minSize: 260 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE"),
        (row) => (
          <DirectoryEntityIdentityCell
            avatar={<WorkspaceAvatar name={row.workspaceName} size={24} />}
            name={row.workspaceName}
            className="text-footnote text-label-primary"
          />
        ),
        { id: "workspace", sortKey: "workspace_name", size: 280, minSize: 240 },
      ),
      createOwnerCell<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        {
          size: 280,
          minSize: 240,
        },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_RUNTIME_HEALTH"),
        (row) => {
          const health = row.operations.health;
          const tone =
            health === "healthy"
              ? "green"
              : health === "degraded"
                ? "red"
                : health === "inactive"
                  ? "gold"
                  : "default";
          const icon = health === "unavailable" ? Database : Gauge;
          return renderTag(resolveFilterLabel("runtimeHealth", health), { tone, icon });
        },
        { id: "runtimeHealth" },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_DOMAINS"),
        (row) => {
          const operations = row.operations;
          const tone =
            operations.domainState === "ready"
              ? "green"
              : operations.domainState === "attention_required"
                ? "gold"
                : "default";
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              {renderTag(resolveFilterLabel("domainState", operations.domainState), {
                tone,
                icon: Globe2,
              })}
              <span className="text-caption tabular-nums text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_DOMAIN_COUNT", {
                  count: number.format(operations.domainCount),
                })}
              </span>
            </div>
          );
        },
        { id: "domains", size: 180, minSize: 160 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_RELEASE"),
        (row) => {
          const operations = row.operations;
          const tone =
            operations.releaseState === "active" || operations.releaseState === "published"
              ? "green"
              : operations.releaseState === "scheduled"
                ? "blue"
                : operations.releaseState === "cancelled"
                  ? "red"
                  : "default";
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              {renderTag(resolveFilterLabel("releaseState", operations.releaseState), {
                tone,
                icon: Rocket,
              })}
              {operations.latestReleaseNumber ? (
                <span className="text-caption tabular-nums text-label-secondary">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RELEASE_NUMBER", {
                    number: number.format(operations.latestReleaseNumber),
                  })}
                </span>
              ) : null}
            </div>
          );
        },
        { id: "release", size: 180, minSize: 160 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_USAGE_30D"),
        (row) => {
          const usage = row.operations.usage;
          if (usage.coverage === "no_observed_usage") {
            return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_USAGE_NONE"), {
              tone: "default",
              icon: ChartNoAxesCombined,
            });
          }
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-footnote font-medium tabular-nums text-label-primary">
                {currency.format(usage.costMicros / 1_000_000)}
              </span>
              <span className="text-caption tabular-nums text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_USAGE_REQUESTS", {
                  count: number.format(usage.requests),
                })}
              </span>
            </div>
          );
        },
        { id: "usage", size: 180, minSize: 160 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderCountTag(row.memberCount),
        { id: "members", sortKey: "member_count" },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS"),
        (row) =>
          renderTag(
            isDirectoryRestrictionActive(row, "project_suspended")
              ? t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED")
              : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE"),
            {
              tone: isDirectoryRestrictionActive(row, "project_suspended") ? "red" : "green",
              icon: isDirectoryRestrictionActive(row, "project_suspended") ? PowerOff : ShieldCheck,
            },
          ),
        { id: "state" },
      ),
      createDateColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ACTIVITY_AT"),
        (row) => row.lastActivityAt,
        dateTime,
        { id: "activityAt", sortKey: "activity_at" },
      ),
      createDateColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
      createActionsColumn<SystemDirectoryProject>({
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
                setDetailsTarget({ project: row, tab: "overview" });
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
                  icon={<ExternalLink className="size-4" />}
                  onSelect={() =>
                    void navigate({
                      to: "/projects/$projectId",
                      params: { projectId: row.projectId },
                    })
                  }
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_OPEN")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={<Gauge className="size-4" />}
                  onSelect={() => setDetailsTarget({ project: row, tab: "runtime" })}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_RUNTIME")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={<ChartNoAxesCombined className="size-4" />}
                  onSelect={() => setDetailsTarget({ project: row, tab: "usage" })}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_USAGE")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<Pencil className="size-4" />}
                  onSelect={() => setEditTarget(row)}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_PROJECT")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={<Palette className="size-4" />}
                  onSelect={() => setIconTarget(row)}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_CHANGE_ICON")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={
                    isDirectoryRestrictionActive(row, "project_suspended") ? (
                      <Power className="size-4" />
                    ) : (
                      <PowerOff className="size-4" />
                    )
                  }
                  variant={
                    isDirectoryRestrictionActive(row, "project_suspended")
                      ? "default"
                      : "destructive"
                  }
                  onSelect={() =>
                    setConfirmAction({
                      kind: isDirectoryRestrictionActive(row, "project_suspended")
                        ? "enable"
                        : "disable",
                      projects: [row],
                    })
                  }
                >
                  {isDirectoryRestrictionActive(row, "project_suspended")
                    ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT")
                    : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<Trash2 className="size-4" />}
                  variant="destructive"
                  onSelect={() => setConfirmAction({ kind: "delete", projects: [row] })}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT")}
                </DropdownMenuIconItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }),
    ],
    [currency, dateTime, navigate, number, resolveFilterLabel, t],
  );

  const extraQuery = useMemo(() => {
    const createdRange = rangeFilterValues(filters, "createdAt");
    const activityRange = rangeFilterValues(filters, "activityAt");
    return {
      workspaceId: firstFilterValue(filters, "workspaceId"),
      isActive: booleanFilterValue(firstFilterValue(filters, "isActive")),
      ownerUserId: firstFilterValue(filters, "ownerUserId"),
      runtimeHealth: firstFilterValue(filters, "runtimeHealth"),
      domainState: firstFilterValue(filters, "domainState"),
      releaseState: firstFilterValue(filters, "releaseState"),
      createdFrom: createdRange.start,
      createdTo: createdRange.end,
      activityFrom: activityRange.start,
      activityTo: activityRange.end,
    };
  }, [filters]);
  const tableHook = useSystemDirectoryProjectsTable(columns, extraQuery, {
    q: props.search?.q,
    sorting: toTableSorting(props.search?.ordering ?? DEFAULT_PROJECT_SORT),
  });
  const activeSort = toProjectSortValue(tableHook.sorting) ?? DEFAULT_PROJECT_SORT;
  const requestSearch = tableHook.requestParams?.q ?? "";

  useEffect(() => {
    props.onSearchChange?.({
      q: requestSearch || undefined,
      ordering: activeSort === DEFAULT_PROJECT_SORT ? undefined : activeSort,
      workspaceId: extraQuery.workspaceId,
      isActive: extraQuery.isActive,
      ownerUserId: extraQuery.ownerUserId,
      runtimeHealth: extraQuery.runtimeHealth as SystemDirectoryProjectsSearch["runtimeHealth"],
      domainState: extraQuery.domainState as SystemDirectoryProjectsSearch["domainState"],
      releaseState: extraQuery.releaseState as SystemDirectoryProjectsSearch["releaseState"],
      createdFrom: extraQuery.createdFrom,
      createdTo: extraQuery.createdTo,
      activityFrom: extraQuery.activityFrom,
      activityTo: extraQuery.activityTo,
    });
  }, [activeSort, extraQuery, props.onSearchChange, requestSearch]);
  const filterItems = useMemo(() => toFilters(filters), [filters]);
  const reuiI18n = useMemo(
    () => buildReuiFilterI18n(t, t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_FILTER_TITLE")),
    [t],
  );
  const filterFields = useMemo<FilterFieldConfig<ProjectFilterValue>[]>(
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
        key: "workspaceId",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_WORKSPACE"),
        type: "select",
        icon: <LayoutTemplate className="size-4" />,
        searchable: true,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: workspaceOptions.workspaces.map((workspace) => ({
          value: workspace.workspaceId,
          label: workspace.name,
        })),
      },
      {
        key: "runtimeHealth",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_RUNTIME_HEALTH"),
        type: "select",
        icon: <Gauge className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: ["healthy", "degraded", "inactive", "not_deployed", "unavailable"].map(
          (value) => ({ value, label: resolveFilterLabel("runtimeHealth", value) }),
        ),
      },
      {
        key: "domainState",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_DOMAIN_STATE"),
        type: "select",
        icon: <Globe2 className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: ["ready", "attention_required", "none"].map((value) => ({
          value,
          label: resolveFilterLabel("domainState", value),
        })),
      },
      {
        key: "releaseState",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_RELEASE_STATE"),
        type: "select",
        icon: <Rocket className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: ["active", "scheduled", "published", "cancelled", "not_released"].map((value) => ({
          value,
          label: resolveFilterLabel("releaseState", value),
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
    [resolveFilterLabel, t, userOptions.users, workspaceOptions.workspaces],
  );

  const resolveColumnFilterAction = useCallback(
    (header: Header<SystemDirectoryProject, unknown>) => {
      if (header.column.id === "owner") {
        return {
          active: Boolean(filters.ownerUserId),
          summary: summarizeProjectFilter(filters, "ownerUserId", (value) =>
            resolveFilterLabel("ownerUserId", value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "workspace") {
        return {
          active: Boolean(filters.workspaceId),
          summary: summarizeProjectFilter(filters, "workspaceId", (value) =>
            resolveFilterLabel("workspaceId", value),
          ),
          onSelect: () => void 0,
        };
      }
      const operationalField = {
        runtimeHealth: "runtimeHealth",
        domains: "domainState",
        release: "releaseState",
      }[header.column.id] as ProjectFilterField | undefined;
      if (operationalField) {
        return {
          active: Boolean(filters[operationalField]),
          summary: summarizeProjectFilter(filters, operationalField, (value) =>
            resolveFilterLabel(operationalField, value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "state") {
        return {
          active: Boolean(filters.isActive),
          summary: summarizeProjectFilter(filters, "isActive", (value) =>
            resolveFilterLabel("isActive", value),
          ),
          onSelect: () => void 0,
        };
      }
      return undefined;
    },
    [filters, resolveFilterLabel],
  );
  const hasOverrides = filterItems.length > 0 || activeSort !== DEFAULT_PROJECT_SORT;
  const toolbarLeading = useMemo(
    () => (
      <>
        <Select
          value={activeSort}
          onValueChange={(next) => tableHook.setSorting(toTableSorting(next as ProjectSortValue))}
        >
          <SelectTrigger className="w-[14rem] min-w-[14rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            {PROJECT_SORT_OPTIONS.map((option) => (
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
            <Button variant="outline" disabled={workspaceOptions.isLoading}>
              <ListFilter className="size-4" />
            </Button>
          }
        />
        {hasOverrides ? (
          <Button
            variant="outline"
            onClick={() => {
              setFilters({});
              tableHook.setSorting(toTableSorting(DEFAULT_PROJECT_SORT));
            }}
          >
            <FunnelX className="size-4" />
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RESET")}
          </Button>
        ) : null}
      </>
    ),
    [
      activeSort,
      filterFields,
      filterItems,
      hasOverrides,
      reuiI18n,
      t,
      tableHook,
      workspaceOptions.isLoading,
    ],
  );

  const selectedProjects = tableHook.table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedActive = selectedProjects.filter(
    (item) => !isDirectoryRestrictionActive(item, "project_suspended"),
  );
  const selectedInactive = selectedProjects.filter((item) =>
    isDirectoryRestrictionActive(item, "project_suspended"),
  );
  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    const count = confirmAction.projects.length;
    if (confirmAction.kind === "disable") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_PROJECT_TITLE"),
        description:
          count > 1
            ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_PROJECT_DESC_MANY")
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_PROJECT_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "delete") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_PROJECT_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_PROJECT_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT"),
        variant: "destructive" as const,
        confirmName: {
          expected: confirmAction.projects[0]?.name ?? "",
          label: t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
          placeholder: t("settings:SETTINGS_PROJECT_DELETE_CONFIRM_NAME_PLACEHOLDER"),
          mismatchMessage: t("settings:SETTINGS_PROJECT_DELETE_CONFIRM_NAME_MISMATCH"),
        },
      };
    }
    return {
      title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_PROJECT_TITLE"),
      description:
        count > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_PROJECT_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_PROJECT_DESC_ONE"),
      confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT"),
      variant: "default" as const,
    };
  }, [confirmAction, t]);
  const confirmRestriction = useMemo(() => {
    if (!confirmAction || confirmAction.kind === "delete") return undefined;
    return {
      mode: confirmAction.kind === "disable" ? ("enforce" as const) : ("lift" as const),
      current: findDirectoryRestriction(confirmAction.projects[0]!, "project_suspended"),
    };
  }, [confirmAction]);
  const confirmPending =
    governance.disableProjectsMutation.isPending ||
    governance.enableProjectsMutation.isPending ||
    governance.deleteProjectMutation.isPending;

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SEARCH"),
        }}
        toolbarLeading={toolbarLeading}
        resolveColumnFilterAction={resolveColumnFilterAction}
        onRowClick={(project) => setDetailsTarget({ project, tab: "overview" })}
        bulkActions={[
          {
            key: "disable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT"),
            icon: <PowerOff className="size-4" />,
            disabled: selectedActive.length === 0,
            onClick: () => setConfirmAction({ kind: "disable", projects: selectedActive }),
          },
          {
            key: "enable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT"),
            icon: <ShieldCheck className="size-4" />,
            disabled: selectedInactive.length === 0,
            onClick: () => setConfirmAction({ kind: "enable", projects: selectedInactive }),
          },
        ]}
      />
      <ProjectOperationsDrawer
        project={detailsTarget?.project ?? null}
        initialTab={detailsTarget?.tab}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
        onEdit={setEditTarget}
        onChangeIcon={setIconTarget}
        onToggleAccess={(project) =>
          setConfirmAction({
            kind: isDirectoryRestrictionActive(project, "project_suspended") ? "enable" : "disable",
            projects: [project],
          })
        }
        onDelete={(project) => setConfirmAction({ kind: "delete", projects: [project] })}
      />
      <EditProjectDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        project={editTarget}
        pending={governance.updateProjectMutation.isPending}
        onSubmit={async (values) => {
          if (!editTarget) return;
          await governance.updateProjectMutation.mutateAsync({
            projectId: editTarget.projectId,
            name: values.name,
            slug: values.slug,
            description: values.description,
          });
        }}
      />
      <DirectoryIconDialog
        open={Boolean(iconTarget)}
        onOpenChange={(open) => {
          if (!open) setIconTarget(null);
        }}
        kind="project"
        entity={iconTarget}
        pending={governance.updateProjectMutation.isPending}
        onSubmit={async (values: DirectoryIconValues) => {
          if (!iconTarget) return;
          await governance.updateProjectMutation.mutateAsync({
            projectId: iconTarget.projectId,
            ...values,
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
            if (confirmAction.kind === "delete") {
              const [project] = confirmAction.projects;
              if (!project) return;
              await governance.deleteProjectMutation.mutateAsync({
                projectId: project.projectId,
                confirmName: values.confirmName,
              });
              return;
            }
            if (!values.transition) throw new Error("ACCESS_RESTRICTION_TRANSITION_REQUIRED");
            const targets = confirmAction.projects.map((item) => ({
              id: item.projectId,
              expectedRevision: getDirectoryRestrictionRevision(item, "project_suspended"),
            }));
            if (confirmAction.kind === "disable") {
              await governance.disableProjectsMutation.mutateAsync({
                targets,
                transition: values.transition,
              });
              return;
            }
            await governance.enableProjectsMutation.mutateAsync({
              targets,
              transition: values.transition,
            });
          }}
        />
      ) : null}
    </>
  );
}
