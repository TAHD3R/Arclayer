import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

import { MiniCategoryNav } from "@arclayer/ui/mini-category-nav";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@arclayer/ui/input-group";

type ExtensionsFilterSidebarProps = {
  categories: { key: string; label: string }[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  officialChecked: boolean;
  communityChecked: boolean;
  onOfficialChange: (checked: boolean) => void;
  onCommunityChange: (checked: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export function ExtensionsFilterSidebar({
  categories,
  selectedCategory,
  onCategoryChange,
  officialChecked,
  communityChecked,
  onOfficialChange,
  onCommunityChange,
  searchQuery,
  onSearchChange,
}: ExtensionsFilterSidebarProps) {
  const { t } = useTranslation(["plugin"]);

  return (
    <aside className="w-56 shrink-0 space-y-4">
      <InputGroup>
        <InputGroupAddon>
          <Search className="size-4 text-label-tertiary" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={t("plugin:PLUGIN_CENTER_SEARCH_PLACEHOLDER")}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {searchQuery ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={t("common:CLEAR", { defaultValue: "Clear" })}
              size="icon-xs"
              onClick={() => onSearchChange("")}
            >
              <X className="size-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>

      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox checked={officialChecked} onCheckedChange={onOfficialChange} />
          <span>{t("plugin:EXTENSION_FILTER_OFFICIAL")}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox checked={communityChecked} onCheckedChange={onCommunityChange} />
          <span>{t("plugin:EXTENSION_FILTER_COMMUNITY")}</span>
        </label>
      </div>

      <div className="border-t border-border" />

      <MiniCategoryNav
        items={categories}
        selectedKey={selectedCategory}
        onSelect={onCategoryChange}
      />
    </aside>
  );
}
