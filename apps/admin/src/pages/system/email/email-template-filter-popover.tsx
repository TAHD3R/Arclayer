import { useMemo } from "react";
import {
  BadgeCheck,
  Blocks,
  CircleCheck,
  FunnelX,
  Languages,
  ListFilter,
  Power,
  Tags,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { MailTemplateFilters, MailTemplateOrdering } from "@/api/mail";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { getLocaleMetadata } from "@/lib/i18n";
import { Button } from "@arclayer/ui/button";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

type FilterValue = string;
type FilterField = "category" | "owner" | "locale" | "enabled" | "validationState" | "sourceState";

const DEFAULT_ORDERING: MailTemplateOrdering = "key";
const OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function toFilters(value: MailTemplateFilters): Filter<FilterValue>[] {
  const filters: Filter<FilterValue>[] = [];
  if (value.category) filters.push(createFilter("category", "is", [value.category]));
  if (value.owner) filters.push(createFilter("owner", "is", [value.owner]));
  if (value.locale) filters.push(createFilter("locale", "is", [value.locale]));
  if (value.enabled !== undefined) {
    filters.push(createFilter("enabled", "is", [String(value.enabled)]));
  }
  if (value.validationState) {
    filters.push(createFilter("validationState", "is", [value.validationState]));
  }
  if (value.sourceState) filters.push(createFilter("sourceState", "is", [value.sourceState]));
  return filters;
}

function fromFilters(filters: Filter<FilterValue>[]): MailTemplateFilters {
  const next: MailTemplateFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (!first) continue;
    if (filter.field === "category") next.category = first as MailTemplateFilters["category"];
    if (filter.field === "owner") next.owner = first as MailTemplateFilters["owner"];
    if (filter.field === "locale") next.locale = first;
    if (filter.field === "enabled") next.enabled = first === "true";
    if (filter.field === "validationState") {
      next.validationState = first as MailTemplateFilters["validationState"];
    }
    if (filter.field === "sourceState") {
      next.sourceState = first as MailTemplateFilters["sourceState"];
    }
  }
  return next;
}

export function EmailTemplateFilterPopover(props: {
  value: MailTemplateFilters;
  onChange: (next: MailTemplateFilters) => void;
  ordering: MailTemplateOrdering;
  onOrderingChange: (next: MailTemplateOrdering) => void;
}) {
  const { t, i18n } = useTranslation(["common", "settings", "account"]);
  const filterItems = useMemo(() => toFilters(props.value), [props.value]);
  const filterI18n = useMemo(
    () => buildReuiFilterI18n(t, t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_FILTER_TITLE")),
    [t],
  );
  const operators = useMemo(
    () => OPERATORS.map((item) => ({ value: item.value, label: t(item.labelKey) })),
    [t],
  );
  const fields = useMemo<FilterFieldConfig<FilterValue>[]>(
    () => [
      {
        key: "category" satisfies FilterField,
        label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_CATEGORY"),
        type: "select",
        icon: <Tags className="size-4" />,
        operators,
        options: ["account", "security", "invitation", "notification", "operations", "custom"].map(
          (value) => ({
            value,
            label: t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CATEGORY_${value.toUpperCase()}`),
          }),
        ),
      },
      {
        key: "owner" satisfies FilterField,
        label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_OWNER_LABEL"),
        type: "select",
        icon: <Blocks className="size-4" />,
        operators,
        options: ["builtin", "plugin", "custom"].map((value) => ({
          value,
          label: t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_OWNER_${value.toUpperCase()}`),
        })),
      },
      {
        key: "locale" satisfies FilterField,
        label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_LANGUAGES"),
        type: "select",
        icon: <Languages className="size-4" />,
        operators,
        options: ["zh-CN", "en-US"].map((locale) => ({
          value: locale,
          label: `${getLocaleMetadata(locale, i18n.t.bind(i18n)).label} · ${locale}`,
        })),
      },
      {
        key: "enabled" satisfies FilterField,
        label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_STATUS"),
        type: "select",
        icon: <Power className="size-4" />,
        operators,
        options: [
          {
            value: "true",
            label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ENABLED_STATUS"),
          },
          {
            value: "false",
            label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DISABLED_STATUS"),
          },
        ],
      },
      {
        key: "validationState" satisfies FilterField,
        label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VALIDATION_LABEL"),
        type: "select",
        icon: <CircleCheck className="size-4" />,
        operators,
        options: ["valid", "invalid"].map((value) => ({
          value,
          label: t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VALIDATION_${value.toUpperCase()}`),
        })),
      },
      {
        key: "sourceState" satisfies FilterField,
        label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SOURCE_LABEL"),
        type: "select",
        icon: <BadgeCheck className="size-4" />,
        operators,
        options: ["default", "overridden", "custom"].map((value) => ({
          value,
          label: t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SOURCE_${value.toUpperCase()}`),
        })),
      },
    ],
    [i18n, operators, t],
  );
  const orderingOptions: Array<{ value: MailTemplateOrdering; label: string }> = [
    { value: "key", label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ORDER_KEY") },
    { value: "name", label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ORDER_NAME") },
    {
      value: "-updated_at",
      label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ORDER_UPDATED_DESC"),
    },
    { value: "updated_at", label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ORDER_UPDATED_ASC") },
    { value: "-version", label: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ORDER_VERSION_DESC") },
  ];
  const hasOverrides = filterItems.length > 0 || props.ordering !== DEFAULT_ORDERING;

  return (
    <>
      <Select value={props.ordering} onValueChange={props.onOrderingChange}>
        <SelectTrigger
          className="w-[12rem] min-w-[12rem]"
          aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ORDER_LABEL")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" position="popper">
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
        onChange={(next) => props.onChange(fromFilters(next))}
        i18n={filterI18n}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button
            variant="outline"
            aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_FILTER_TITLE")}
          >
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
          {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}
