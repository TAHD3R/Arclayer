import { Button, Select } from "antd";
import { Filter } from "lucide-react";

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { ContentPagesFilters } from "./content-pages-types";

type ContentPagesFilterPopoverProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  value: ContentPagesFilters;
  onChange: (next: ContentPagesFilters) => void;
  onReset: () => void;
};

export function ContentPagesFilterPopover(props: ContentPagesFilterPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="text"
          icon={<Filter size={18} />}
          title={props.t("content_pages:FILTER_TITLE")}
          className="!h-10 !bg-transparent hover:!bg-accent/40"
        >
          {props.t("content_pages:FILTER_TITLE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="font-bold">{props.t("content_pages:FILTER_TITLE")}</div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {props.t("content_pages:FILTER_FIELD_STATUS")}
            </div>
            <Select
              value={props.value.status}
              onChange={(status) => props.onChange({ ...props.value, status })}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { value: "all", label: props.t("content_pages:INDEX_FILTER_STATUS_ALL") },
                { value: "draft", label: props.t("content_pages:INDEX_FILTER_STATUS_DRAFT") },
                { value: "published", label: props.t("content_pages:INDEX_FILTER_STATUS_PUBLISHED") },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {props.t("content_pages:FILTER_FIELD_VISIBILITY")}
            </div>
            <Select
              value={props.value.visibility}
              onChange={(visibility) => props.onChange({ ...props.value, visibility })}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { value: "all", label: props.t("content_pages:INDEX_FILTER_VISIBILITY_ALL") },
                { value: "public", label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PUBLIC") },
                { value: "private", label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PRIVATE") },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button onClick={props.onReset}>{props.t("content_pages:FILTER_RESET")}</Button>
          <PopoverClose asChild>
            <Button type="primary">{props.t("content_pages:FILTER_DONE")}</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
