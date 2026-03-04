import { Input } from "antd";
import { Search } from "lucide-react";

import { LoaderOne } from "@celestial/ui/loader";

import { ContentPagesFilterPopover } from "./content-pages-filter-popover";
import type { ContentPagesFilters } from "../types";

type ContentPagesToolbarProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  filters: ContentPagesFilters;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onFiltersChange: (next: ContentPagesFilters) => void;
  onResetFilters: () => void;
  isFetching: boolean;
};

export function ContentPagesToolbar(props: ContentPagesToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-2">
      <div className="flex items-center gap-2">
        <Input
          allowClear
          value={props.searchInput}
          onChange={(event) => props.onSearchInputChange(event.target.value)}
          placeholder={props.t("content_pages:INDEX_SEARCH_PLACEHOLDER")}
          variant="filled"
          prefix={<Search size={16} className="text-label-secondary" />}
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
