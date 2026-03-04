import { Button } from "antd";
import type { ChangeEvent } from "react";
import { Filter } from "lucide-react";

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@celestial/ui/popover";

import type { ContentPagesFilters } from "../types";

type ContentPagesFilterPopoverProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  value: ContentPagesFilters;
  onChange: (next: ContentPagesFilters) => void;
  onReset: () => void;
};

// Tailwind-styled native select to replace Antd Select
function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
      className="h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-footnote shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function ContentPagesFilterPopover(props: ContentPagesFilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          icon={<Filter size={18} />}
          title={props.t("content_pages:FILTER_TITLE")}
          autoInsertSpace={false}
        >
          {props.t("content_pages:FILTER_TITLE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="font-bold">{props.t("content_pages:FILTER_TITLE")}</div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {props.t("content_pages:FILTER_FIELD_STATUS")}
            </div>
            <FilterSelect
              value={props.value.status}
              onChange={(status) => props.onChange({ ...props.value, status })}
              options={[
                { value: "all", label: props.t("content_pages:INDEX_FILTER_STATUS_ALL") },
                { value: "draft", label: props.t("content_pages:INDEX_FILTER_STATUS_DRAFT") },
                {
                  value: "published",
                  label: props.t("content_pages:INDEX_FILTER_STATUS_PUBLISHED"),
                },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {props.t("content_pages:FILTER_FIELD_VISIBILITY")}
            </div>
            <FilterSelect
              value={props.value.visibility}
              onChange={(visibility) => props.onChange({ ...props.value, visibility })}
              options={[
                { value: "all", label: props.t("content_pages:INDEX_FILTER_VISIBILITY_ALL") },
                {
                  value: "public",
                  label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PUBLIC"),
                },
                {
                  value: "private",
                  label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PRIVATE"),
                },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button onClick={props.onReset} autoInsertSpace={false}>
            {props.t("content_pages:FILTER_RESET")}
          </Button>
          <PopoverClose asChild>
            <Button type="primary" autoInsertSpace={false}>
              {props.t("content_pages:FILTER_DONE")}
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
