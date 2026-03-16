import { Filter } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DateTimeRangeField } from "@/components/ui/date-time-range-field";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import type { AdminAssetTag } from "@/types/api";
export type AssetsFilters = {
  mimePrefix?: string;
  visibility?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];

  // Reserved for future backend filtering dimensions.
};

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

  const visibilityOptions = useMemo(
    () => [
      { label: t("assets:ASSET_FILTER_VISIBILITY_ALL"), value: "all" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_PUBLIC"), value: "public" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_PRIVATE"), value: "private" },
      { label: t("assets:ASSET_FILTER_VISIBILITY_SHARED"), value: "shared" },
    ],
    [t],
  );
  const orderingOptions = useMemo(
    () => [
      { label: t("assets:ASSET_SORT_NEWEST"), value: "-created_at" },
      { label: t("assets:ASSET_SORT_OLDEST"), value: "created_at" },
      { label: t("assets:ASSET_SORT_SIZE_LARGE"), value: "-size_bytes" },
      { label: t("assets:ASSET_SORT_SIZE_SMALL"), value: "size_bytes" },
    ],
    [t],
  );

  const selectedTagIds = props.value.tagIds ?? [];

  const toggleTag = (tagId: string) => {
    const nextTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((value) => value !== tagId)
      : [...selectedTagIds, tagId];
    props.onChange({ ...props.value, tagIds: nextTagIds });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" title={t("assets:ASSET_FILTER_TITLE")}>
          <Filter size={18} />
          {t("assets:ASSET_FILTER_TITLE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-90 p-3">
        <div className="font-bold">{t("assets:ASSET_FILTER_TITLE")}</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("assets:ASSET_FILTER_FIELD_SORT")}
            </div>
            <Select value={props.ordering} onValueChange={props.onOrderingChange}>
              <SelectTrigger className="w-full">
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
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("assets:ASSET_FILTER_FIELD_VISIBILITY")}
            </div>
            <Select
              value={props.value.visibility ?? "all"}
              onValueChange={(value) =>
                props.onChange({
                  ...props.value,
                  visibility: value === "all" ? undefined : value,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                {visibilityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("assets:ASSET_FILTER_FIELD_CREATED_AT")}
            </div>
            <DateTimeRangeField
              startValue={props.value.createdFrom}
              endValue={props.value.createdTo}
              startAriaLabel={t("assets:ASSET_FILTER_FIELD_CREATED_AT")}
              endAriaLabel={t("assets:ASSET_FILTER_FIELD_CREATED_AT")}
              startPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_START")}
              endPlaceholder={t("activity:ACTIVITY_FILTER_RANGE_END")}
              onChange={({ startValue, endValue }) =>
                props.onChange({
                  ...props.value,
                  createdFrom: startValue,
                  createdTo: endValue,
                })
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("assets:ASSET_FILTER_FIELD_TAGS")}
            </div>
            <div className="max-h-44 overflow-auto rounded-md border border-border/60">
              {props.tagsLoading ? (
                <div className="px-3 py-2 text-footnote text-label-secondary">
                  {t("common:LOADING")}
                </div>
              ) : props.tags.length > 0 ? (
                props.tags.map((tag) => {
                  const checked = selectedTagIds.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleTag(tag.id)} />
                      <span className="min-w-0 flex-1 truncate text-footnote">{tag.name}</span>
                    </label>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-footnote text-label-secondary">
                  {t("assets:ASSET_FILTER_TAGS_PLACEHOLDER")}
                </div>
              )}
            </div>
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
            <Button variant="default">{t("assets:ASSET_FILTER_DONE")}</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
