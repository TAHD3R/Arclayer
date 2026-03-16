import { Search, X } from "lucide-react";
import type React from "react";
import type { ReactNode } from "react";

import type { AdminAssetTag } from "@/types/api";
import ChevronDownIcon from "@arclayer/ui/icons/chevron-down";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@arclayer/ui/input-group";
import { AssetsFilterPopover } from "./assets-filter-popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuIconItem,
} from "@arclayer/ui/dropdown-menu";

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
  moreMenuItems: Array<{ key: string; label: string; icon?: ReactNode }>;
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
            <DropdownMenu open={props.moreOpen} onOpenChange={props.setMoreOpen}>
              <DropdownMenuTrigger asChild>
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
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(props.moreMenuItems ?? []).map((item) => (
                  <DropdownMenuIconItem
                    key={item.key}
                    onSelect={() => {
                      props.setFilters((prev) => ({ ...prev, mimePrefix: `${item.key}/` }));
                      props.setMoreOpen(false);
                    }}
                    icon={item.icon}
                  >
                    {item.label}
                  </DropdownMenuIconItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </ChromeTabsList>
        </ChromeTabs>
      </div>
      <div className="flex items-center gap-2">
        <InputGroup className="w-[260px]">
          <InputGroupAddon>
            <Search size={16} className="text-label-secondary" />
          </InputGroupAddon>
          <InputGroupInput
            value={props.searchInput}
            onChange={(event) => props.setSearchInput(event.target.value)}
            placeholder={props.t("assets:ASSET_SEARCH_PLACEHOLDER")}
          />
          {props.searchInput ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={props.t("common:CLEAR")}
                size="icon-xs"
                onClick={() => props.setSearchInput("")}
              >
                <X className="size-3.5" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
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
