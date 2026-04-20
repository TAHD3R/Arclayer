import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";

import { ExtensionCard } from "./extension-card";
import { ExtensionsFilterSidebar } from "./extensions-filter-sidebar";
import type { InstalledExtensionItem } from "../types";

type ExtensionsExploreTabProps = {
  categoryTabs: { key: string; label: string }[];
  category: string;
  onCategoryChange: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  officialChecked: boolean;
  communityChecked: boolean;
  onOfficialChange: (checked: boolean) => void;
  onCommunityChange: (checked: boolean) => void;
  items: InstalledExtensionItem[];
  buildConfigureHref: (extension: InstalledExtensionItem) => string | null;
  isEmpty: boolean;
};

export function ExtensionsExploreTab({
  categoryTabs,
  category,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  officialChecked,
  communityChecked,
  onOfficialChange,
  onCommunityChange,
  items,
  buildConfigureHref,
  isEmpty,
}: ExtensionsExploreTabProps) {
  const { t } = useTranslation(["plugin", "common"]);

  return (
    <div className="flex gap-6">
      <ExtensionsFilterSidebar
        categories={categoryTabs}
        selectedCategory={category}
        onCategoryChange={onCategoryChange}
        officialChecked={officialChecked}
        communityChecked={communityChecked}
        onOfficialChange={onOfficialChange}
        onCommunityChange={onCommunityChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />

      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <h3 className="text-title3 font-bold">{t("plugin:EXTENSION_EXPLORE_TITLE")}</h3>
          <p className="mt-1 text-callout text-label-secondary">
            {t("plugin:EXTENSION_EXPLORE_DESC")}
          </p>
        </div>

        {isEmpty ? (
          <ContentGuard
            loading={false}
            empty
            emptyTitle={t("common:EMPTY_TITLE")}
            emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((p) => (
                <ExtensionCard key={p.capabilityId} extension={p} href={buildConfigureHref(p)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
