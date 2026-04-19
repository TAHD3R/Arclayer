import { useMemo } from "react";
import {
  AudioLinesIcon,
  CalendarRangeIcon,
  EyeIcon,
  FileCode2Icon,
  FileTextIcon,
  FunnelXIcon,
  ImageIcon,
  ListFilterIcon,
  TagsIcon,
  VideoIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminAssetTag } from "@/types/api";
import { DateTimeRangeField } from "@arclayer/ui/date-time-range-field";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { Button } from "@arclayer/ui/button";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

export type AssetsFilters = {
  mimePrefix?: string;
  visibility?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];
};

type AssetFilterValue = string;

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function toReuiFilters(value: AssetsFilters): Filter<AssetFilterValue>[] {
  const next: Filter<AssetFilterValue>[] = [];

  if (value.mimePrefix) {
    next.push(createFilter("mimePrefix", "is", [value.mimePrefix]));
  }
  if (value.visibility) {
    next.push(createFilter("visibility", "is", [value.visibility]));
  }
  if (value.tagIds?.length) {
    next.push(createFilter("tagIds", "is_any_of", value.tagIds));
  }
  if (value.createdFrom || value.createdTo) {
    next.push(createFilter("createdAt", "is", [value.createdFrom ?? "", value.createdTo ?? ""]));
  }

  return next;
}

function fromReuiFilters(filters: Filter<AssetFilterValue>[]): AssetsFilters {
  const next: AssetsFilters = {};

  for (const filter of filters) {
    if (filter.field === "mimePrefix") {
      const first = filter.values[0];
      if (typeof first === "string" && first) next.mimePrefix = first;
      continue;
    }

    if (filter.field === "visibility") {
      const first = filter.values[0];
      if (typeof first === "string" && first) next.visibility = first;
      continue;
    }

    if (filter.field === "tagIds") {
      next.tagIds = filter.values.filter((value): value is string => typeof value === "string");
      continue;
    }

    if (filter.field === "createdAt") {
      const [createdFrom, createdTo] = filter.values;
      next.createdFrom = typeof createdFrom === "string" && createdFrom ? createdFrom : undefined;
      next.createdTo = typeof createdTo === "string" && createdTo ? createdTo : undefined;
    }
  }

  return next;
}

function formatDateRange(values: AssetFilterValue[]): string {
  const [createdFrom, createdTo] = values;
  const parts = [createdFrom, createdTo].filter(Boolean);
  return parts.length ? parts.join(" - ") : "-";
}

export function AssetsFilterPopover(props: {
  value: AssetsFilters;
  onChange: (next: AssetsFilters) => void;
  ordering: string;
  onOrderingChange: (next: string) => void;
  defaultOrdering?: string;
  tags: AdminAssetTag[];
  tagsLoading?: boolean;
}) {
  const { t } = useTranslation(["assets", "common", "activity"]);

  const orderingOptions = useMemo(
    () => [
      { label: t("assets:ASSET_SORT_NEWEST"), value: "-created_at" },
      { label: t("assets:ASSET_SORT_OLDEST"), value: "created_at" },
      { label: t("assets:ASSET_SORT_SIZE_LARGE"), value: "-size_bytes" },
      { label: t("assets:ASSET_SORT_SIZE_SMALL"), value: "size_bytes" },
    ],
    [t],
  );
  const filterItems = useMemo(() => toReuiFilters(props.value), [props.value]);
  const reuiI18n = useMemo(() => buildReuiFilterI18n(t, t("assets:ASSET_FILTER_TITLE")), [t]);
  const fields = useMemo<FilterFieldConfig<AssetFilterValue>[]>(
    () => [
      {
        key: "mimePrefix",
        label: t("assets:ASSET_FILTER_FIELD_TYPE"),
        type: "select",
        icon: <ImageIcon className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey, { defaultValue: "is" }),
        })),
        options: [
          {
            value: "image/",
            label: t("assets:ASSET_FILTER_TYPE_IMAGE"),
            icon: <ImageIcon className="size-4" />,
          },
          {
            value: "video/",
            label: t("assets:ASSET_FILTER_TYPE_VIDEO"),
            icon: <VideoIcon className="size-4" />,
          },
          {
            value: "audio/",
            label: t("assets:ASSET_FILTER_TYPE_AUDIO"),
            icon: <AudioLinesIcon className="size-4" />,
          },
          {
            value: "text/",
            label: t("assets:ASSET_FILTER_TYPE_TEXT"),
            icon: <FileTextIcon className="size-4" />,
          },
          {
            value: "application/",
            label: t("assets:ASSET_FILTER_TYPE_APP"),
            icon: <FileCode2Icon className="size-4" />,
          },
        ],
      },
      {
        key: "visibility",
        label: t("assets:ASSET_FILTER_FIELD_VISIBILITY"),
        type: "select",
        icon: <EyeIcon className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey, { defaultValue: "is" }),
        })),
        options: [
          {
            value: "public",
            label: t("assets:ASSET_FILTER_VISIBILITY_PUBLIC"),
          },
          {
            value: "private",
            label: t("assets:ASSET_FILTER_VISIBILITY_PRIVATE"),
          },
          {
            value: "shared",
            label: t("assets:ASSET_FILTER_VISIBILITY_SHARED"),
          },
        ],
      },
      {
        key: "createdAt",
        label: t("assets:ASSET_FILTER_FIELD_CREATED_AT"),
        type: "custom",
        icon: <CalendarRangeIcon className="size-4" />,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey, { defaultValue: "is" }),
        })),
        customRenderer: ({ values, onChange }) => (
          <div className="min-w-[18rem]">
            <DateTimeRangeField
              startValue={values[0] || undefined}
              endValue={values[1] || undefined}
              startAriaLabel={t("assets:ASSET_FILTER_FIELD_CREATED_AT")}
              endAriaLabel={t("assets:ASSET_FILTER_FIELD_CREATED_AT")}
              startPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_START")}
              endPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) => onChange([startValue ?? "", endValue ?? ""])}
            />
          </div>
        ),
        customValueRenderer: (values) => formatDateRange(values),
      },
      {
        key: "tagIds",
        label: t("assets:ASSET_FILTER_FIELD_TAGS"),
        type: "multiselect",
        icon: <TagsIcon className="size-4" />,
        searchable: true,
        options: props.tags.map((tag) => ({
          value: tag.id,
          label: tag.name,
        })),
      },
    ],
    [props.tags, t],
  );
  const hasOverrides =
    filterItems.length > 0 || props.ordering !== (props.defaultOrdering ?? "-created_at");

  return (
    <>
      <Filters
        filters={filterItems}
        fields={fields}
        onChange={(next) => props.onChange(fromReuiFilters(next))}
        i18n={reuiI18n}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline" disabled={props.tagsLoading && props.tags.length === 0}>
            <ListFilterIcon className="size-4" />
          </Button>
        }
      />

      <Select value={props.ordering} onValueChange={props.onOrderingChange}>
        <SelectTrigger className="w-[12rem] min-w-[12rem]">
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

      {hasOverrides ? (
        <Button
          variant="outline"
          onClick={() => {
            props.onChange({
              mimePrefix: undefined,
              visibility: undefined,
              createdFrom: undefined,
              createdTo: undefined,
              tagIds: [],
            });
            props.onOrderingChange(props.defaultOrdering ?? "-created_at");
          }}
        >
          <FunnelXIcon className="size-4" />
          {t("assets:ASSET_FILTER_RESET")}
        </Button>
      ) : null}
    </>
  );
}
