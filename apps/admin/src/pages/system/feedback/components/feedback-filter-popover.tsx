import { useMemo } from "react";
import {
  CalendarClock,
  CalendarRange,
  Flag,
  FunnelX,
  ListFilter,
  MessageCircleMore,
  Radio,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  FeedbackIntent,
  FeedbackOrdering,
  FeedbackPriority,
  FeedbackSource,
  FeedbackStatus,
} from "@/api/feedback";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import {
  FEEDBACK_INTENTS,
  FEEDBACK_INTENT_LABELS,
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_SOURCES,
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
} from "@/pages/system/feedback/model";
import { Button } from "@arclayer/ui/button";
import { DateTimeRangeField } from "@arclayer/ui/date-time-range-field";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

export type FeedbackFilters = {
  intent?: FeedbackIntent;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  source?: FeedbackSource;
  createdFrom?: string;
  createdTo?: string;
  activityFrom?: string;
  activityTo?: string;
  reporterUserId?: string;
};

type FeedbackFilterValue = string;
type FeedbackFilterField =
  | "intent"
  | "status"
  | "priority"
  | "source"
  | "createdAt"
  | "lastActivityAt";

const DEFAULT_ORDERING: FeedbackOrdering = "-last_activity_at";
const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function toFilters(value: FeedbackFilters): Filter<FeedbackFilterValue>[] {
  const filters: Filter<FeedbackFilterValue>[] = [];
  if (value.intent) filters.push(createFilter("intent", "is", [value.intent]));
  if (value.status) filters.push(createFilter("status", "is", [value.status]));
  if (value.priority) filters.push(createFilter("priority", "is", [value.priority]));
  if (value.source) filters.push(createFilter("source", "is", [value.source]));
  if (value.createdFrom || value.createdTo) {
    filters.push(createFilter("createdAt", "is", [value.createdFrom ?? "", value.createdTo ?? ""]));
  }
  if (value.activityFrom || value.activityTo) {
    filters.push(
      createFilter("lastActivityAt", "is", [value.activityFrom ?? "", value.activityTo ?? ""]),
    );
  }
  return filters;
}

function fromFilters(filters: Filter<FeedbackFilterValue>[]): FeedbackFilters {
  const next: FeedbackFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (filter.field === "intent" && first) next.intent = first as FeedbackIntent;
    if (filter.field === "status" && first) next.status = first as FeedbackStatus;
    if (filter.field === "priority" && first) next.priority = first as FeedbackPriority;
    if (filter.field === "source" && first) next.source = first as FeedbackSource;
    if (filter.field === "createdAt") {
      next.createdFrom = filter.values[0] || undefined;
      next.createdTo = filter.values[1] || undefined;
    }
    if (filter.field === "lastActivityAt") {
      next.activityFrom = filter.values[0] || undefined;
      next.activityTo = filter.values[1] || undefined;
    }
  }
  return next;
}

function formatRange(values: FeedbackFilterValue[]): string {
  return values.filter(Boolean).join(" – ") || "-";
}

export function FeedbackFilterPopover(props: {
  value: FeedbackFilters;
  onChange: (next: FeedbackFilters) => void;
  ordering: FeedbackOrdering;
  onOrderingChange: (next: FeedbackOrdering) => void;
}) {
  const { t } = useTranslation(["common", "platform", "activity"]);
  const filterItems = useMemo(() => toFilters(props.value), [props.value]);
  const reuiI18n = useMemo(() => buildReuiFilterI18n(t, t("platform:FEEDBACK_FILTER_TITLE")), [t]);
  const operators = useMemo(
    () =>
      FILTER_OPERATORS.map((operator) => ({
        value: operator.value,
        label: t(operator.labelKey, { defaultValue: "is" }),
      })),
    [t],
  );
  const fields = useMemo<FilterFieldConfig<FeedbackFilterValue>[]>(
    () => [
      {
        key: "intent" satisfies FeedbackFilterField,
        label: t("platform:FEEDBACK_DIALOG_INTENT_LABEL"),
        type: "select",
        icon: <MessageCircleMore className="size-4" />,
        searchable: false,
        operators,
        options: FEEDBACK_INTENTS.map((value) => ({
          value,
          label: t(`platform:${FEEDBACK_INTENT_LABELS[value]}`),
        })),
      },
      {
        key: "status" satisfies FeedbackFilterField,
        label: t("platform:FEEDBACK_COLUMN_STATUS"),
        type: "select",
        icon: <Workflow className="size-4" />,
        searchable: false,
        operators,
        options: FEEDBACK_STATUSES.map((value) => ({
          value,
          label: t(`platform:${FEEDBACK_STATUS_LABELS[value]}`),
        })),
      },
      {
        key: "priority" satisfies FeedbackFilterField,
        label: t("platform:FEEDBACK_COLUMN_PRIORITY"),
        type: "select",
        icon: <Flag className="size-4" />,
        searchable: false,
        operators,
        options: FEEDBACK_PRIORITIES.map((value) => ({
          value,
          label: t(`platform:${FEEDBACK_PRIORITY_LABELS[value]}`),
        })),
      },
      {
        key: "source" satisfies FeedbackFilterField,
        label: t("platform:FEEDBACK_FILTER_SOURCE"),
        type: "select",
        icon: <Radio className="size-4" />,
        searchable: false,
        operators,
        options: FEEDBACK_SOURCES.map((value) => ({
          value,
          label: t(`platform:${FEEDBACK_SOURCE_LABELS[value]}`),
        })),
      },
      {
        key: "createdAt" satisfies FeedbackFilterField,
        label: t("platform:FEEDBACK_FILTER_CREATED_AT"),
        type: "custom",
        icon: <CalendarRange className="size-4" />,
        operators,
        customRenderer: ({ values, onChange }) => (
          <div className="min-w-[18rem]">
            <DateTimeRangeField
              startValue={values[0] || undefined}
              endValue={values[1] || undefined}
              startAriaLabel={t("platform:FEEDBACK_FILTER_CREATED_AT")}
              endAriaLabel={t("platform:FEEDBACK_FILTER_CREATED_AT")}
              startPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_START")}
              endPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) => onChange([startValue ?? "", endValue ?? ""])}
            />
          </div>
        ),
        customValueRenderer: formatRange,
      },
      {
        key: "lastActivityAt" satisfies FeedbackFilterField,
        label: t("platform:FEEDBACK_FILTER_LAST_ACTIVITY_AT"),
        type: "custom",
        icon: <CalendarClock className="size-4" />,
        operators,
        customRenderer: ({ values, onChange }) => (
          <div className="min-w-[18rem]">
            <DateTimeRangeField
              startValue={values[0] || undefined}
              endValue={values[1] || undefined}
              startAriaLabel={t("platform:FEEDBACK_FILTER_LAST_ACTIVITY_AT")}
              endAriaLabel={t("platform:FEEDBACK_FILTER_LAST_ACTIVITY_AT")}
              startPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_START")}
              endPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) => onChange([startValue ?? "", endValue ?? ""])}
            />
          </div>
        ),
        customValueRenderer: formatRange,
      },
    ],
    [operators, t],
  );
  const hasOverrides =
    filterItems.length > 0 ||
    Boolean(props.value.reporterUserId) ||
    props.ordering !== DEFAULT_ORDERING;
  const orderingOptions: readonly { value: FeedbackOrdering; label: string }[] = [
    { value: "-last_activity_at", label: t("platform:FEEDBACK_ORDER_ACTIVITY_NEWEST") },
    { value: "last_activity_at", label: t("platform:FEEDBACK_ORDER_ACTIVITY_OLDEST") },
    { value: "-created_at", label: t("platform:FEEDBACK_ORDER_CREATED_NEWEST") },
    { value: "created_at", label: t("platform:FEEDBACK_ORDER_CREATED_OLDEST") },
  ];

  return (
    <>
      <Select value={props.ordering} onValueChange={props.onOrderingChange}>
        <SelectTrigger
          className="w-[13rem] min-w-[13rem]"
          aria-label={t("platform:FEEDBACK_ORDER_LABEL")}
        >
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
        filters={filterItems}
        fields={fields}
        onChange={(next) =>
          props.onChange({
            ...fromFilters(next),
            reporterUserId: props.value.reporterUserId,
          })
        }
        i18n={reuiI18n}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline" aria-label={t("platform:FEEDBACK_FILTER_TITLE")}>
            <ListFilter className="size-4" />
          </Button>
        }
      />
      {hasOverrides ? (
        <Button
          variant="outline"
          onClick={() => {
            props.onChange({});
            props.onOrderingChange(DEFAULT_ORDERING);
          }}
        >
          <FunnelX className="size-4" />
          {t("platform:FEEDBACK_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}
