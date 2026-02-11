import { Button, DatePicker, Select } from "antd";
import { Filter } from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AdminAssetTag } from "@/api/assets";
export type AssetsFilters = {
  mimePrefix?: string;
  visibility?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];

  // Reserved for future backend filtering dimensions.
};

type RangePickerValue = NonNullable<ComponentProps<typeof DatePicker.RangePicker>["value"]>;

function toIsoRangeBoundary(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("toDate" in value && typeof value.toDate === "function") {
    const dateValue = value.toDate() as Date;
    return dateValue.toISOString();
  }
  if ("toISOString" in value && typeof value.toISOString === "function") {
    return value.toISOString() as string;
  }
  return undefined;
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
  const { t } = useTranslation();
  const [rangeValue, setRangeValue] = useState<RangePickerValue | null>(null);

  useEffect(() => {
    // Keep RangePicker state in sync when parent clears filters.
    if (!props.value.createdFrom && !props.value.createdTo) {
      setRangeValue(null);
    }
  }, [props.value.createdFrom, props.value.createdTo]);

  const visibilityOptions = useMemo(
    () => [
      { label: t("assets:ASSET_FILTER_VISIBILITY_ALL"), value: "all" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_PUBLIC"), value: "public" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_PRIVATE"), value: "private" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_SHARED"), value: "shared" },
    ],
    [t],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="text"
          icon={<Filter size={18} />}
          title={t("assets:ASSET_FILTER_TITLE")}
          className="!h-10 !bg-transparent hover:!bg-accent/40"
        >
          {t("assets:ASSET_FILTER_TITLE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-90 p-3">
        <div className="font-bold">{t("assets:ASSET_FILTER_TITLE")}</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_SORT")}
            </div>
            <Select
              value={props.ordering}
              onChange={props.onOrderingChange}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { label: t("assets:ASSET_SORT_NEWEST"), value: "-created_at" },
                { label: t("assets:ASSET_SORT_OLDEST"), value: "created_at" },
                { label: t("assets:ASSET_SORT_SIZE_LARGE"), value: "-size_bytes" },
                { label: t("assets:ASSET_SORT_SIZE_SMALL"), value: "size_bytes" },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_VISIBILITY")}
            </div>
            <Select
              value={props.value.visibility ?? "all"}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              onChange={(v) =>
                props.onChange({ ...props.value, visibility: v === "all" ? undefined : v })
              }
              options={visibilityOptions}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_CREATED_AT")}
            </div>
            <DatePicker.RangePicker
              showTime
              allowClear
              value={rangeValue}
              onChange={(values) => {
                setRangeValue(values ?? null);
                const start = values?.[0];
                const end = values?.[1];
                const createdFrom = toIsoRangeBoundary(start);
                const createdTo = toIsoRangeBoundary(end);
                props.onChange({
                  ...props.value,
                  createdFrom: createdFrom || undefined,
                  createdTo: createdTo || undefined,
                });
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("assets:ASSET_FILTER_FIELD_TAGS")}
            </div>
            <Select
              mode="multiple"
              allowClear
              loading={props.tagsLoading}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              value={props.value.tagIds ?? []}
              onChange={(tagIds) => props.onChange({ ...props.value, tagIds })}
              placeholder={t("assets:ASSET_FILTER_TAGS_PLACEHOLDER")}
              options={props.tags.map((tag) => ({ label: tag.name, value: tag.id }))}
              showSearch
              optionFilterProp="label"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            onClick={() => {
              props.onChange({
                visibility: undefined,
                createdFrom: undefined,
                createdTo: undefined,
                tagIds: [],
              });
              props.onOrderingChange(props.defaultOrdering ?? "-created_at");
            }}
          >
            {t("assets:ASSET_FILTER_RESET")}
          </Button>

          <PopoverClose asChild>
            <Button type="primary">{t("assets:ASSET_FILTER_DONE")}</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
