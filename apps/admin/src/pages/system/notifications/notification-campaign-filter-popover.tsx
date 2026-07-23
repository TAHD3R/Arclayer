import { useMemo } from "react";
import { FunnelX, ListFilter, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  NotificationCampaignOrdering,
  NotificationCampaignState,
} from "@/api/notification-campaigns";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { Button } from "@arclayer/ui/button";
import { createFilter, Filters, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

export type NotificationCampaignFilters = {
  states?: readonly NotificationCampaignState[];
};

export const DEFAULT_CAMPAIGN_ORDERING: NotificationCampaignOrdering = "-updated_at";

export const CAMPAIGN_STATES: readonly NotificationCampaignState[] = [
  "draft",
  "scheduled",
  "dispatching",
  "completed",
  "partially_failed",
  "cancelled",
  "archived",
];

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

export function NotificationCampaignFilterPopover(props: {
  value: NotificationCampaignFilters;
  onChange: (next: NotificationCampaignFilters) => void;
  ordering: NotificationCampaignOrdering;
  onOrderingChange: (next: NotificationCampaignOrdering) => void;
}) {
  const { t } = useTranslation(["common", "settings"]);
  const operators = useMemo(
    () =>
      FILTER_OPERATORS.map((operator) => ({
        value: operator.value,
        label: t(operator.labelKey),
      })),
    [t],
  );
  const fields = useMemo<FilterFieldConfig<string>[]>(
    () => [
      {
        key: "state",
        label: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_STATE"),
        type: "multiselect",
        icon: <Workflow className="size-4" />,
        searchable: false,
        operators,
        options: CAMPAIGN_STATES.map((state) => ({
          value: state,
          label: t(`settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_STATE_${state.toUpperCase()}`),
        })),
      },
    ],
    [operators, t],
  );
  const filters = useMemo(
    () =>
      props.value.states?.length ? [createFilter("state", "is", [...props.value.states])] : [],
    [props.value.states],
  );
  const hasOverrides = filters.length > 0 || props.ordering !== DEFAULT_CAMPAIGN_ORDERING;
  const orderingOptions: readonly { value: NotificationCampaignOrdering; label: string }[] = [
    {
      value: "-updated_at",
      label: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ORDER_UPDATED_NEWEST"),
    },
    {
      value: "updated_at",
      label: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ORDER_UPDATED_OLDEST"),
    },
    {
      value: "-created_at",
      label: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ORDER_CREATED_NEWEST"),
    },
    {
      value: "-schedule_at",
      label: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ORDER_SCHEDULE_LATEST"),
    },
    {
      value: "-priority",
      label: t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ORDER_PRIORITY_HIGH"),
    },
  ];

  return (
    <>
      <Select value={props.ordering} onValueChange={props.onOrderingChange}>
        <SelectTrigger
          className="w-[13rem] min-w-[13rem]"
          aria-label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ORDER_LABEL")}
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
        filters={filters}
        fields={fields}
        onChange={(next) => {
          const stateFilter = next.find((item) => item.field === "state");
          props.onChange({
            states: stateFilter?.values as NotificationCampaignState[] | undefined,
          });
        }}
        i18n={buildReuiFilterI18n(
          t,
          t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FILTER_TITLE"),
        )}
        allowMultiple={false}
        trigger={
          <Button
            type="button"
            variant="outline"
            aria-label={t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FILTER_TITLE")}
          >
            <ListFilter className="size-4" />
          </Button>
        }
      />
      {hasOverrides ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            props.onChange({});
            props.onOrderingChange(DEFAULT_CAMPAIGN_ORDERING);
          }}
        >
          <FunnelX className="size-4" />
          {t("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}
