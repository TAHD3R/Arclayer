import { Input } from "antd";
import { Search } from "lucide-react";

import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@/components/ui/chrome-tabs";
import { LoaderOne } from "@/components/ui/loader";

import { ContentPagesFilterPopover } from "./content-pages-filter-popover";
import type { ContentPagesFilters } from "./content-pages-types";

type ContentPagesToolbarProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  filters: ContentPagesFilters;
  onTypeChange: (type: ContentPagesFilters["type"]) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onFiltersChange: (next: ContentPagesFilters) => void;
  onResetFilters: () => void;
  isFetching: boolean;
};

export function ContentPagesToolbar(props: ContentPagesToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <ChromeTabs value={props.filters.type} onValueChange={(next) => props.onTypeChange(next as ContentPagesFilters["type"])}>
          <ChromeTabsList className="w-auto">
            <ChromeTabsTrigger value="all">{props.t("content_pages:INDEX_FILTER_TYPE_ALL")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="static">{props.t("content_pages:INDEX_FILTER_TYPE_STATIC")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="template">{props.t("content_pages:INDEX_FILTER_TYPE_TEMPLATE")}</ChromeTabsTrigger>
          </ChromeTabsList>
        </ChromeTabs>
      </div>

      <div className="flex items-center gap-2">
        <Input
          allowClear
          variant="borderless"
          value={props.searchInput}
          onChange={(event) => props.onSearchInputChange(event.target.value)}
          placeholder={props.t("content_pages:INDEX_SEARCH_PLACEHOLDER")}
          prefix={<Search size={16} className="text-muted-foreground" />}
          style={{ width: 320, maxWidth: "100%" }}
        />

        <ContentPagesFilterPopover
          t={props.t}
          value={props.filters}
          onChange={props.onFiltersChange}
          onReset={props.onResetFilters}
        />

        {props.isFetching ? <LoaderOne /> : null}
      </div>
    </div>
  );
}
