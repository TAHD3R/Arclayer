import { useTranslation } from "react-i18next";
import { Input } from "antd";
import { Search } from "lucide-react";

import { MiniCategoryNav } from "@/components/common/mini-category-nav";
import { Checkbox } from "@/components/ui/checkbox";

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
      {/* Search input */}
      <Input
        prefix={<Search className="size-4 text-label-tertiary" />}
        placeholder={t("plugin:PLUGIN_CENTER_SEARCH_PLACEHOLDER")}
        allowClear
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {/* Source filter checkboxes */}
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

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Category menu */}
      <MiniCategoryNav
        items={categories}
        selectedKey={selectedCategory}
        onSelect={onCategoryChange}
      />
    </aside>
  );
}
