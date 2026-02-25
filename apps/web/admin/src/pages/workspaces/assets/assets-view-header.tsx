import { Dropdown, Input } from "antd";
import { Search } from "lucide-react";
import type { MenuProps } from "antd";
import type React from "react";

import type { AdminAssetTag } from "@/api/assets";
import ChevronDownIcon from "@/components/ui/icons/chevron-down";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@/components/ui/chrome-tabs";
import { AssetsFilterPopover } from "@/components/common/assets/assets-filter-popover";

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
  moreMenuItems: MenuProps["items"];
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <ChromeTabs
          value={props.typeTabValue}
          onValueChange={(next) => {
            if (next === "all") {
              props.setFilters((prev) => ({ ...prev, mimePrefix: undefined }));
              props.setMoreOpen(false);
              return;
            }
            if (next === "image") {
              props.setFilters((prev) => ({ ...prev, mimePrefix: "image/" }));
              props.setMoreOpen(false);
              return;
            }
            if (next === "video") {
              props.setFilters((prev) => ({ ...prev, mimePrefix: "video/" }));
              props.setMoreOpen(false);
            }
          }}
        >
          <ChromeTabsList className="w-auto">
            <ChromeTabsTrigger value="all">
              {props.t("assets:ASSET_TYPE_TAB_ALL")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="image">
              {props.t("assets:ASSET_FILTER_TYPE_IMAGE")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="video">
              {props.t("assets:ASSET_FILTER_TYPE_VIDEO")}
            </ChromeTabsTrigger>
            <Dropdown
              trigger={["click"]}
              open={props.moreOpen}
              onOpenChange={(open) => props.setMoreOpen(open)}
              menu={{
                items: props.moreMenuItems,
                onClick: (info) => {
                  if (info.key === "audio") {
                    props.setFilters((prev) => ({ ...prev, mimePrefix: "audio/" }));
                    props.setMoreOpen(false);
                    return;
                  }
                  if (info.key === "text") {
                    props.setFilters((prev) => ({ ...prev, mimePrefix: "text/" }));
                    props.setMoreOpen(false);
                    return;
                  }
                  if (info.key === "application") {
                    props.setFilters((prev) => ({ ...prev, mimePrefix: "application/" }));
                    props.setMoreOpen(false);
                  }
                },
              }}
            >
              <ChromeTabsTrigger
                value="more"
                className="flex items-center gap-1"
                onMouseEnter={() => props.setMoreHovered(true)}
                onMouseLeave={() => props.setMoreHovered(false)}
              >
                <span>{props.moreTabLabel}</span>
                <ChevronDownIcon
                  size={16}
                  className="opacity-75"
                  isHovered={props.moreHovered || props.moreOpen}
                />
              </ChromeTabsTrigger>
            </Dropdown>
          </ChromeTabsList>
        </ChromeTabs>
      </div>
      <div className="flex items-center gap-2">
        <Input
          allowClear
          variant="borderless"
          value={props.searchInput}
          onChange={(event) => props.setSearchInput(event.target.value)}
          placeholder={props.t("assets:ASSET_SEARCH_PLACEHOLDER")}
          prefix={<Search size={16} className="text-label-secondary" />}
          style={{ width: 260 }}
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
    </div>
  );
}
