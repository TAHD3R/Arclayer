import { useMemo } from "react";
import { Clock3, FunnelX, Gauge, ListFilter, Network, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  HTTPRequestGroupOrdering,
  HTTPRequestRecordOrdering,
} from "@/api/platform-observability";
import type { ActivityOrdering } from "@/api/activity";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { Button } from "@arclayer/ui/button";
import { DateTimeRangeField } from "@arclayer/ui/date-time-range-field";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

export type AuditRequestFilters = {
  method?: string;
  statusClass?: number;
  workspaceId?: string;
  projectId?: string;
  actorUserId?: string;
  hasError?: boolean;
};

export type AuditEventFilters = {
  occurredFrom?: string;
  occurredTo?: string;
  workspaceId?: string;
  projectId?: string;
  actorUserId?: string;
  entityType?: string;
};

type LabelMap = Readonly<Record<string, string>>;
type FilterValue = string;
type RequestOrdering = HTTPRequestRecordOrdering | HTTPRequestGroupOrdering;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const STATUS_CLASSES = [2, 3, 4, 5] as const;
const OPERATOR_IS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function selectOptions(labels: LabelMap) {
  return Object.entries(labels)
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ value, label }));
}

function requestToFilters(value: AuditRequestFilters): Filter<FilterValue>[] {
  const filters: Filter<FilterValue>[] = [];
  if (value.method) filters.push(createFilter("method", "is", [value.method]));
  if (value.statusClass)
    filters.push(createFilter("statusClass", "is", [String(value.statusClass)]));
  if (value.workspaceId) filters.push(createFilter("workspaceId", "is", [value.workspaceId]));
  if (value.projectId) filters.push(createFilter("projectId", "is", [value.projectId]));
  if (value.actorUserId) filters.push(createFilter("actorUserId", "is", [value.actorUserId]));
  if (value.hasError !== undefined) {
    filters.push(createFilter("hasError", "is", [String(value.hasError)]));
  }
  return filters;
}

function requestFromFilters(filters: Filter<FilterValue>[]): AuditRequestFilters {
  const value: AuditRequestFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (!first) continue;
    if (filter.field === "method") value.method = first;
    if (filter.field === "statusClass") value.statusClass = Number(first);
    if (filter.field === "workspaceId") value.workspaceId = first;
    if (filter.field === "projectId") value.projectId = first;
    if (filter.field === "actorUserId") value.actorUserId = first;
    if (filter.field === "hasError") value.hasError = first === "true";
  }
  return value;
}

export function AuditRequestControls(props: {
  mode: "records" | "groups";
  value: AuditRequestFilters;
  onChange: (value: AuditRequestFilters) => void;
  ordering: RequestOrdering;
  onOrderingChange: (value: RequestOrdering) => void;
  workspaceLabelById?: LabelMap;
  projectLabelById?: LabelMap;
}) {
  const { t } = useTranslation(["common", "platform"]);
  const filters = useMemo(() => requestToFilters(props.value), [props.value]);
  const operators = useMemo(
    () => OPERATOR_IS.map((item) => ({ value: item.value, label: t(item.labelKey) })),
    [t],
  );
  const fields = useMemo<FilterFieldConfig<FilterValue>[]>(() => {
    const shared: FilterFieldConfig<FilterValue>[] = [
      {
        key: "method",
        label: t("platform:AUDIT_REQUEST_METHOD"),
        type: "select",
        icon: <Network className="size-4" />,
        searchable: false,
        operators,
        options: METHODS.map((value) => ({ value, label: value })),
      },
      {
        key: "statusClass",
        label: t("platform:AUDIT_REQUEST_STATUS"),
        type: "select",
        icon: <Gauge className="size-4" />,
        searchable: false,
        operators,
        options: STATUS_CLASSES.map((value) => ({ value: String(value), label: `${value}xx` })),
      },
    ];
    const workspaces = selectOptions(props.workspaceLabelById ?? {});
    const projects = selectOptions(props.projectLabelById ?? {});
    if (workspaces.length) {
      shared.push({
        key: "workspaceId",
        label: t("platform:AUDIT_FILTER_WORKSPACE"),
        type: "select",
        operators,
        options: workspaces,
      });
    }
    if (projects.length) {
      shared.push({
        key: "projectId",
        label: t("platform:AUDIT_FILTER_PROJECT"),
        type: "select",
        operators,
        options: projects,
      });
    }
    if (props.mode === "records") {
      shared.push(
        {
          key: "actorUserId",
          label: t("platform:AUDIT_EVENT_ACTOR"),
          type: "text",
          icon: <UserRound className="size-4" />,
          operators,
        },
        {
          key: "hasError",
          label: t("platform:AUDIT_FILTER_ERROR_PRESENCE"),
          type: "select",
          operators,
          searchable: false,
          options: [
            { value: "true", label: t("platform:AUDIT_FILTER_ERRORS_ONLY") },
            { value: "false", label: t("platform:AUDIT_FILTER_NON_ERRORS_ONLY") },
          ],
        },
      );
    }
    return shared;
  }, [operators, props.mode, props.projectLabelById, props.workspaceLabelById, t]);
  const orderingOptions: readonly { value: RequestOrdering; label: string }[] =
    props.mode === "records"
      ? [
          { value: "-occurred_at", label: t("platform:AUDIT_ORDER_NEWEST") },
          { value: "occurred_at", label: t("platform:AUDIT_ORDER_OLDEST") },
          { value: "-duration_ms", label: t("platform:AUDIT_ORDER_SLOWEST") },
          { value: "duration_ms", label: t("platform:AUDIT_ORDER_FASTEST") },
          { value: "-status_code", label: t("platform:AUDIT_ORDER_STATUS_SEVERITY") },
        ]
      : [
          { value: "-requests", label: t("platform:AUDIT_ORDER_REQUEST_VOLUME") },
          { value: "-error_rate", label: t("platform:AUDIT_ORDER_ERROR_RATE") },
          { value: "-p95_latency_ms", label: t("platform:AUDIT_ORDER_P95") },
          { value: "-p99_latency_ms", label: t("platform:AUDIT_ORDER_P99") },
          { value: "-avg_latency_ms", label: t("platform:AUDIT_ORDER_AVG_LATENCY") },
          { value: "-last_seen_at", label: t("platform:AUDIT_ORDER_RECENT_ACTIVITY") },
        ];
  const defaultOrdering: RequestOrdering = props.mode === "records" ? "-occurred_at" : "-requests";
  const hasOverrides = filters.length > 0 || props.ordering !== defaultOrdering;

  return (
    <>
      <Select
        value={props.ordering}
        onValueChange={(value) => props.onOrderingChange(value as RequestOrdering)}
      >
        <SelectTrigger className="w-52" aria-label={t("platform:AUDIT_ORDER_LABEL")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" position="popper">
          {orderingOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Filters
        filters={filters}
        fields={fields}
        onChange={(next) => props.onChange(requestFromFilters(next))}
        i18n={buildReuiFilterI18n(t, t("platform:AUDIT_FILTER_TITLE"))}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline" aria-label={t("platform:AUDIT_FILTER_TITLE")}>
            <ListFilter className="size-4" />
          </Button>
        }
      />
      {hasOverrides ? (
        <Button
          variant="outline"
          onClick={() => {
            props.onChange({});
            props.onOrderingChange(defaultOrdering);
          }}
        >
          <FunnelX className="size-4" />
          {t("platform:AUDIT_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}

function eventToFilters(value: AuditEventFilters): Filter<FilterValue>[] {
  const filters: Filter<FilterValue>[] = [];
  if (value.occurredFrom || value.occurredTo) {
    filters.push(
      createFilter("occurredAt", "is", [value.occurredFrom ?? "", value.occurredTo ?? ""]),
    );
  }
  for (const key of ["workspaceId", "projectId", "actorUserId", "entityType"] as const) {
    if (value[key]) filters.push(createFilter(key, "is", [value[key]]));
  }
  return filters;
}

function eventFromFilters(filters: Filter<FilterValue>[]): AuditEventFilters {
  const value: AuditEventFilters = {};
  for (const filter of filters) {
    if (filter.field === "occurredAt") {
      value.occurredFrom = filter.values[0] || undefined;
      value.occurredTo = filter.values[1] || undefined;
    }
    const first = filter.values[0];
    if (!first) continue;
    if (filter.field === "workspaceId") value.workspaceId = first;
    if (filter.field === "projectId") value.projectId = first;
    if (filter.field === "actorUserId") value.actorUserId = first;
    if (filter.field === "entityType") value.entityType = first;
  }
  return value;
}

export function AuditEventControls(props: {
  value: AuditEventFilters;
  onChange: (value: AuditEventFilters) => void;
  ordering: ActivityOrdering;
  onOrderingChange: (value: ActivityOrdering) => void;
  workspaceLabelById: LabelMap;
  projectLabelById: LabelMap;
}) {
  const { t } = useTranslation(["activity", "common", "platform"]);
  const filters = useMemo(() => eventToFilters(props.value), [props.value]);
  const operators = useMemo(() => [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }], [t]);
  const fields = useMemo<FilterFieldConfig<FilterValue>[]>(
    () => [
      {
        key: "occurredAt",
        label: t("platform:AUDIT_EVENT_TIME"),
        type: "custom",
        icon: <Clock3 className="size-4" />,
        operators,
        customRenderer: ({ values, onChange }) => (
          <div className="min-w-72">
            <DateTimeRangeField
              startValue={values[0] || undefined}
              endValue={values[1] || undefined}
              startAriaLabel={t("platform:AUDIT_EVENT_TIME")}
              endAriaLabel={t("platform:AUDIT_EVENT_TIME")}
              startPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_START")}
              endPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) => onChange([startValue ?? "", endValue ?? ""])}
            />
          </div>
        ),
        customValueRenderer: (values) => values.filter(Boolean).join(" – ") || "-",
      },
      {
        key: "workspaceId",
        label: t("platform:AUDIT_FILTER_WORKSPACE"),
        type: "select",
        operators,
        options: selectOptions(props.workspaceLabelById),
      },
      {
        key: "projectId",
        label: t("platform:AUDIT_FILTER_PROJECT"),
        type: "select",
        operators,
        options: selectOptions(props.projectLabelById),
      },
      {
        key: "actorUserId",
        label: t("platform:AUDIT_EVENT_ACTOR"),
        type: "text",
        icon: <UserRound className="size-4" />,
        operators,
      },
      {
        key: "entityType",
        label: t("platform:AUDIT_EVENT_TARGET"),
        type: "text",
        operators,
      },
    ],
    [operators, props.projectLabelById, props.workspaceLabelById, t],
  );
  const defaultOrdering: ActivityOrdering = "-occurred_at";
  const hasOverrides = filters.length > 0 || props.ordering !== defaultOrdering;

  return (
    <>
      <Select
        value={props.ordering}
        onValueChange={(value) => props.onOrderingChange(value as ActivityOrdering)}
      >
        <SelectTrigger className="w-52" aria-label={t("platform:AUDIT_ORDER_LABEL")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" position="popper">
          <SelectItem value="-occurred_at">{t("platform:AUDIT_ORDER_NEWEST")}</SelectItem>
          <SelectItem value="occurred_at">{t("platform:AUDIT_ORDER_OLDEST")}</SelectItem>
        </SelectContent>
      </Select>
      <Filters
        filters={filters}
        fields={fields}
        onChange={(next) => props.onChange(eventFromFilters(next))}
        i18n={buildReuiFilterI18n(t, t("platform:AUDIT_FILTER_TITLE"))}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline" aria-label={t("platform:AUDIT_FILTER_TITLE")}>
            <ListFilter className="size-4" />
          </Button>
        }
      />
      {hasOverrides ? (
        <Button
          variant="outline"
          onClick={() => {
            props.onChange({});
            props.onOrderingChange(defaultOrdering);
          }}
        >
          <FunnelX className="size-4" />
          {t("platform:AUDIT_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}
