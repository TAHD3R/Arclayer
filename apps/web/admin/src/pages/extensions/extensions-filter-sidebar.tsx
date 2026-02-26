import { useTranslation } from "react-i18next";
import { Checkbox, Input } from "antd";
import { Search } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

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
          <Checkbox
            checked={officialChecked}
            onChange={(e) => onOfficialChange(e.target.checked)}
          />
          <span>{t("plugin:EXTENSION_FILTER_OFFICIAL")}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={communityChecked}
            onChange={(e) => onCommunityChange(e.target.checked)}
          />
          <span>{t("plugin:EXTENSION_FILTER_COMMUNITY")}</span>
        </label>
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Category menu */}
      <nav className="space-y-0.5">
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onCategoryChange(cat.key)}
            className={cn(
              "relative flex h-8 w-full items-center pl-3 text-footnote transition-colors duration-150",
              selectedCategory === cat.key
                ? "font-semibold text-foreground"
                : "text-label-secondary hover:text-label-primary",
            )}
          >
            {selectedCategory === cat.key ? (
              <motion.span
                layoutId="category-indicator"
                layout="position"
                className="absolute pointer-events-none inset-y-0 left-0 w-0.75 bg-primary"
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              />
            ) : null}
            {cat.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
