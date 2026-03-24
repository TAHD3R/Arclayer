import { CalendarRangeIcon, FunnelXIcon, ListFilterIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { DateTimeRangeField } from "@/components/ui/date-time-range-field";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import {
  DebounceSelect,
  type DebounceSelectOption,
} from "@/pages/workspaces/shared/activity/components/debounce-select";

export type ActivityFilters = {
  occurredFrom?: string;
  occurredTo?: string;
  eventName?: string;
  workspaceId?: string;
  actorUserId?: string;
  subjectUserId?: string;
};

type ActivityFilterValue = string;

function trimOrUndefined(value?: string | null): string | undefined {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function toReuiFilters(value: ActivityFilters): Filter<ActivityFilterValue>[] {
  const next: Filter<ActivityFilterValue>[] = [];

  if (value.occurredFrom || value.occurredTo) {
    next.push(createFilter("occurredAt", "is", [value.occurredFrom ?? "", value.occurredTo ?? ""]));
  }
  if (value.eventName) {
    next.push(createFilter("eventName", "contains", [value.eventName]));
  }
  if (value.workspaceId) {
    next.push(createFilter("workspaceId", "is", [value.workspaceId]));
  }
  if (value.actorUserId) {
    next.push(createFilter("actorUserId", "is", [value.actorUserId]));
  }
  if (value.subjectUserId) {
    next.push(createFilter("subjectUserId", "is", [value.subjectUserId]));
  }

  return next;
}

function fromReuiFilters(filters: Filter<ActivityFilterValue>[]): ActivityFilters {
  const next: ActivityFilters = {};

  for (const filter of filters) {
    const first = filter.values[0];

    if (filter.field === "occurredAt") {
      const [occurredFrom, occurredTo] = filter.values;
      next.occurredFrom =
        typeof occurredFrom === "string" && occurredFrom ? occurredFrom : undefined;
      next.occurredTo = typeof occurredTo === "string" && occurredTo ? occurredTo : undefined;
      continue;
    }

    if (typeof first !== "string" || !first) continue;

    if (filter.field === "eventName") {
      next.eventName = first;
      continue;
    }
    if (filter.field === "workspaceId") {
      next.workspaceId = first;
      continue;
    }
    if (filter.field === "actorUserId") {
      next.actorUserId = first;
      continue;
    }
    if (filter.field === "subjectUserId") {
      next.subjectUserId = first;
    }
  }

  return next;
}

function serializeFilters(filters: ActivityFilters): string {
  return JSON.stringify({
    occurredFrom: trimOrUndefined(filters.occurredFrom),
    occurredTo: trimOrUndefined(filters.occurredTo),
    eventName: trimOrUndefined(filters.eventName),
    workspaceId: trimOrUndefined(filters.workspaceId),
    actorUserId: trimOrUndefined(filters.actorUserId),
    subjectUserId: trimOrUndefined(filters.subjectUserId),
  });
}

function formatDateRange(values: ActivityFilterValue[]): string {
  const [occurredFrom, occurredTo] = values;
  const parts = [occurredFrom, occurredTo].filter(Boolean);
  return parts.length ? parts.join(" - ") : "-";
}

export function ActivityFilterPopover(props: {
  scope: "workspace" | "org";
  workspaceId?: string | null;
  value: ActivityFilters;
  defaultValue: ActivityFilters;
  onApply: (next: ActivityFilters) => void;
  workspaceItems?: Array<{ workspaceId: string; name?: string | null; slug?: string | null }>;
  workspacesLoading?: boolean;
  fetchUserOptions: (workspaceId: string, q: string) => Promise<DebounceSelectOption[]>;
}) {
  const { t } = useTranslation(["activity", "common"]);
  const [workspaceOption, setWorkspaceOption] = React.useState<DebounceSelectOption | undefined>();
  const [actorOption, setActorOption] = React.useState<DebounceSelectOption | undefined>();
  const [subjectOption, setSubjectOption] = React.useState<DebounceSelectOption | undefined>();
  const [draftFilters, setDraftFilters] = React.useState<Filter<ActivityFilterValue>[]>(() =>
    toReuiFilters(props.value),
  );

  const serializedValue = React.useMemo(() => serializeFilters(props.value), [props.value]);
  const reuiI18n = React.useMemo(
    () => buildReuiFilterI18n(t, t("activity:ACTIVITY_FILTER_TITLE")),
    [t],
  );
  const selectedWorkspaceId =
    props.scope === "workspace"
      ? trimOrUndefined(props.workspaceId)
      : trimOrUndefined(props.value.workspaceId);
  const canPickActorSubject = Boolean(selectedWorkspaceId);
  const hasOverrides = serializeFilters(props.value) !== serializeFilters(props.defaultValue);

  React.useEffect(() => {
    setDraftFilters(toReuiFilters(props.value));
  }, [serializedValue]);

  const workspaceLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of props.workspaceItems ?? []) {
      map.set(item.workspaceId, item.name || item.slug || item.workspaceId);
    }
    return map;
  }, [props.workspaceItems]);

  const buildUserField = React.useCallback(
    (args: {
      key: "actorUserId" | "subjectUserId";
      label: string;
      placeholder: string;
      emptyText: string;
      option: DebounceSelectOption | undefined;
      setOption: (value: DebounceSelectOption | undefined) => void;
      disabledPlaceholder?: string;
    }): FilterFieldConfig<ActivityFilterValue> => ({
      key: args.key,
      label: args.label,
      type: "custom",
      operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS", { defaultValue: "is" }) }],
      customRenderer: ({ values, onChange }) => {
        const selectedId = typeof values[0] === "string" && values[0] ? values[0] : undefined;

        return (
          <div className="min-w-[18rem]">
            <DebounceSelect
              labelInValue
              value={
                selectedId ? (args.option ?? { value: selectedId, label: selectedId }) : undefined
              }
              allowClear
              disabled={!canPickActorSubject}
              placeholder={
                canPickActorSubject
                  ? args.placeholder
                  : (args.disabledPlaceholder ?? args.placeholder)
              }
              emptyText={args.emptyText}
              fetchOptions={async (search) => {
                if (!selectedWorkspaceId) return [];
                return props.fetchUserOptions(selectedWorkspaceId, search);
              }}
              onChange={(option) => {
                if (option) {
                  args.setOption({
                    value: String(option.value),
                    label: option.label,
                    avatarUrl: option.avatarUrl ?? null,
                  });
                  onChange([String(option.value)]);
                  return;
                }
                args.setOption(undefined);
                onChange([]);
              }}
            />
          </div>
        );
      },
      customValueRenderer: (values) => {
        const selectedId = typeof values[0] === "string" && values[0] ? values[0] : undefined;
        if (!selectedId) return "-";
        return args.option?.label ?? selectedId;
      },
    }),
    [canPickActorSubject, props, selectedWorkspaceId, t],
  );

  const fields = React.useMemo<FilterFieldConfig<ActivityFilterValue>[]>(() => {
    const next: FilterFieldConfig<ActivityFilterValue>[] = [
      {
        key: "occurredAt",
        label: t("activity:ACTIVITY_FIELD_OCCURRED_AT"),
        type: "custom",
        icon: <CalendarRangeIcon className="size-4" />,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS", { defaultValue: "is" }) }],
        customRenderer: ({ values, onChange }) => (
          <div className="min-w-[18rem]">
            <DateTimeRangeField
              startValue={values[0] || undefined}
              endValue={values[1] || undefined}
              startAriaLabel={t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
              endAriaLabel={t("activity:ACTIVITY_FIELD_OCCURRED_AT")}
              startPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_START")}
              endPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) => onChange([startValue ?? "", endValue ?? ""])}
            />
          </div>
        ),
        customValueRenderer: (values) => formatDateRange(values),
      },
      {
        key: "eventName",
        label: t("activity:ACTIVITY_FILTER_EVENT_NAME"),
        type: "text",
        placeholder: t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER"),
        operators: [
          {
            value: "contains",
            label: t("common:FILTER_OPERATOR_CONTAINS", { defaultValue: "contains" }),
          },
        ],
        defaultOperator: "contains",
      },
    ];

    if (props.scope === "org") {
      next.push({
        key: "workspaceId",
        label: t("activity:ACTIVITY_FILTER_WORKSPACE"),
        type: "custom",
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS", { defaultValue: "is" }) }],
        customRenderer: ({ values, onChange }) => {
          const selectedId = typeof values[0] === "string" && values[0] ? values[0] : undefined;

          return (
            <div className="min-w-[18rem]">
              <DebounceSelect
                labelInValue
                value={
                  selectedId
                    ? (workspaceOption ?? {
                        value: selectedId,
                        label: workspaceLabelById.get(selectedId) ?? selectedId,
                      })
                    : undefined
                }
                allowClear
                disabled={Boolean(props.workspacesLoading)}
                placeholder={t("activity:ACTIVITY_FILTER_WORKSPACE")}
                emptyText={t("activity:ACTIVITY_FILTER_EMPTY")}
                fetchOptions={async (search) => {
                  const needle = trimOrUndefined(search)?.toLowerCase() ?? "";
                  const items = props.workspaceItems ?? [];
                  const rows = !needle
                    ? items
                    : items.filter((item) => {
                        const haystack =
                          `${item.name || ""} ${item.slug || ""} ${item.workspaceId}`.toLowerCase();
                        return haystack.includes(needle);
                      });

                  return rows.slice(0, 20).map((item) => ({
                    value: item.workspaceId,
                    label: item.name || item.slug || item.workspaceId,
                  }));
                }}
                onChange={(option) => {
                  if (option) {
                    setWorkspaceOption({
                      value: String(option.value),
                      label: option.label,
                    });
                    onChange([String(option.value)]);
                    return;
                  }
                  setWorkspaceOption(undefined);
                  onChange([]);
                }}
              />
            </div>
          );
        },
        customValueRenderer: (values) => {
          const selectedId = typeof values[0] === "string" && values[0] ? values[0] : undefined;
          if (!selectedId) return "-";
          return workspaceOption?.label ?? workspaceLabelById.get(selectedId) ?? selectedId;
        },
      });
    }

    next.push(
      buildUserField({
        key: "actorUserId",
        label: t("activity:ACTIVITY_FILTER_ACTOR"),
        placeholder: t("activity:ACTIVITY_FILTER_ACTOR"),
        disabledPlaceholder: t("activity:ACTIVITY_FILTER_ACTOR_NEED_WORKSPACE"),
        emptyText: t("activity:ACTIVITY_FILTER_EMPTY"),
        option: actorOption,
        setOption: setActorOption,
      }),
      buildUserField({
        key: "subjectUserId",
        label: t("activity:ACTIVITY_FILTER_SUBJECT"),
        placeholder: t("activity:ACTIVITY_FILTER_SUBJECT"),
        emptyText: t("activity:ACTIVITY_FILTER_EMPTY"),
        option: subjectOption,
        setOption: setSubjectOption,
      }),
    );

    return next;
  }, [
    actorOption,
    buildUserField,
    props.scope,
    props.workspaceItems,
    props.workspacesLoading,
    setActorOption,
    setSubjectOption,
    subjectOption,
    t,
    workspaceLabelById,
    workspaceOption,
  ]);

  const handleFiltersChange = React.useCallback(
    (next: Filter<ActivityFilterValue>[]) => {
      setDraftFilters(next);
      const nextWorkspaceId = trimOrUndefined(
        typeof next.find((filter) => filter.field === "workspaceId")?.values[0] === "string"
          ? (next.find((filter) => filter.field === "workspaceId")?.values[0] as string)
          : undefined,
      );
      const workspaceChanged =
        props.scope === "org" && nextWorkspaceId !== trimOrUndefined(props.value.workspaceId);
      const sanitized = workspaceChanged
        ? next.filter(
            (filter) => filter.field !== "actorUserId" && filter.field !== "subjectUserId",
          )
        : next;

      if (workspaceChanged) {
        setActorOption(undefined);
        setSubjectOption(undefined);
      }

      props.onApply(fromReuiFilters(sanitized));
    },
    [props, setActorOption, setSubjectOption],
  );

  return (
    <>
      <Filters
        filters={draftFilters}
        fields={fields}
        onChange={handleFiltersChange}
        i18n={reuiI18n}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline">
            <ListFilterIcon className="size-4" />
            {t("activity:ACTIVITY_FILTER_TITLE")}
          </Button>
        }
      />

      {hasOverrides ? (
        <Button
          variant="outline"
          onClick={() => {
            setWorkspaceOption(undefined);
            setActorOption(undefined);
            setSubjectOption(undefined);
            setDraftFilters(toReuiFilters(props.defaultValue));
            props.onApply(props.defaultValue);
          }}
        >
          <FunnelXIcon className="size-4" />
          {t("activity:ACTIVITY_FILTER_RESET", { defaultValue: t("common:CLEAR") })}
        </Button>
      ) : null}
    </>
  );
}
