import type React from "react";

import type { AdminAssetTag } from "@/types/api";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { AssetsFilterPopover } from "./assets-filter-popover";

interface AssetsFilterValue {
  mimePrefix?: string;
  visibility?: string;
  createdFrom?: string;
  createdTo?: string;
  tagIds?: string[];
}

interface AssetsViewHeaderProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  typeTabValue: string;
  setFilters: React.Dispatch<React.SetStateAction<AssetsFilterValue>>;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  moreOpen: boolean;
  moreMenuItems: Array<{ key: string; label: string; icon?: React.ReactNode }>;
  moreTabLabel: string;
  moreHovered: boolean;
  setMoreHovered: React.Dispatch<React.SetStateAction<boolean>>;
  searchInput: string;
  setSearchInput: React.Dispatch<React.SetStateAction<string>>;
  filters: AssetsFilterValue;
  ordering: string;
  setOrdering: React.Dispatch<React.SetStateAction<string>>;
  tags: AdminAssetTag[];
  tagsLoading: boolean;
}

export function AssetsViewHeader(props: AssetsViewHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DataTableSearchInput
        value={props.searchInput}
        onChange={props.setSearchInput}
        placeholder={props.t("assets:ASSET_SEARCH_PLACEHOLDER")}
        clearLabel={props.t("common:CLEAR")}
      />

      <AssetsFilterPopover
        value={props.filters}
        onChange={props.setFilters}
        ordering={props.ordering}
        onOrderingChange={props.setOrdering}
        defaultOrdering="-created_at"
        tags={props.tags}
        tagsLoading={props.tagsLoading}
      />
    </div>
  );
}
