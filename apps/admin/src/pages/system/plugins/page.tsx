import { useQuery } from "@tanstack/react-query";
import { PackagePlus, PackageSearch, RefreshCw } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listSystemPluginCatalog,
  type SystemPluginCatalogItem,
  type SystemPluginCatalogQuery,
} from "@/api/plugins";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ApiError } from "@/lib/http";
import { Button } from "@arclayer/ui/button";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import { PluginCard } from "./plugin-card";
import { PluginDetailDrawer } from "./plugin-detail-drawer";
import { PluginManualInstallDialog } from "./plugin-manual-install-dialog";

type PluginTab = "installed" | "updates" | "catalog";
type PluginOrdering = NonNullable<SystemPluginCatalogQuery["ordering"]>;

const PLUGIN_TABS: PluginTab[] = ["installed", "updates", "catalog"];
const ORDERINGS: PluginOrdering[] = ["name", "-name", "version", "-version"];

function isPluginTab(value: string): value is PluginTab {
  return PLUGIN_TABS.includes(value as PluginTab);
}

function isPluginOrdering(value: string): value is PluginOrdering {
  return ORDERINGS.includes(value as PluginOrdering);
}

export function SystemPluginsPage() {
  const { t } = useTranslation(["settings", "common"]);
  const [activeTab, setActiveTab] = useState<PluginTab>("installed");
  const [search, setSearch] = useState("");
  const [ordering, setOrdering] = useState<PluginOrdering>("name");
  const [detailPlugin, setDetailPlugin] = useState<SystemPluginCatalogItem | null>(null);
  const [manualInstallOpen, setManualInstallOpen] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());
  const pluginsQuery = useQuery({
    queryKey: ["system", "plugins", "catalog", activeTab, deferredSearch, ordering],
    queryFn: ({ signal }) =>
      listSystemPluginCatalog(
        {
          search: deferredSearch || undefined,
          installedOnly: activeTab === "installed",
          updatesOnly: activeTab === "updates",
          includeOnline: activeTab === "catalog",
          ordering,
        },
        signal,
      ),
    retry: false,
  });
  const catalogNotConfigured =
    activeTab === "catalog" &&
    pluginsQuery.error instanceof ApiError &&
    pluginsQuery.error.error === "PLUGIN_CATALOG_NOT_CONFIGURED";
  const hasSearch = deferredSearch.length > 0;
  const emptyTitle = catalogNotConfigured
    ? t("settings:SETTINGS_SYSTEM_PLUGINS_CATALOG_NOT_CONFIGURED_TITLE")
    : hasSearch
      ? t("settings:SETTINGS_SYSTEM_PLUGINS_NO_RESULTS_TITLE")
      : t(`settings:SETTINGS_SYSTEM_PLUGINS_${activeTab.toUpperCase()}_EMPTY_TITLE`);
  const emptyDescription = catalogNotConfigured
    ? t("settings:SETTINGS_SYSTEM_PLUGINS_CATALOG_NOT_CONFIGURED_DESC")
    : hasSearch
      ? t("settings:SETTINGS_SYSTEM_PLUGINS_NO_RESULTS_DESC")
      : t(`settings:SETTINGS_SYSTEM_PLUGINS_${activeTab.toUpperCase()}_EMPTY_DESC`);

  return (
    <>
      <DefaultPage
        title={t("settings:SETTINGS_SYSTEM_PLUGINS_PAGE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_PLUGINS_PAGE_DESC")}
        action={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setManualInstallOpen(true)}>
              <PackagePlus data-icon="inline-start" />
              {t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_ACTION")}
            </Button>
            <Button type="button" onClick={() => setActiveTab("catalog")}>
              <PackageSearch data-icon="inline-start" />
              {t("settings:SETTINGS_SYSTEM_PLUGINS_BROWSE_ACTION")}
            </Button>
          </div>
        }
      >
        <ChromeTabs
          value={activeTab}
          onValueChange={(value) => {
            if (isPluginTab(value)) setActiveTab(value);
          }}
        >
          <ChromeTabsList className="w-auto">
            {PLUGIN_TABS.map((tab) => (
              <ChromeTabsTrigger key={tab} value={tab}>
                {t(`settings:SETTINGS_SYSTEM_PLUGINS_TAB_${tab.toUpperCase()}`)}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>
        </ChromeTabs>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <DataTableSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("settings:SETTINGS_SYSTEM_PLUGINS_SEARCH_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
              className="w-full max-w-sm"
            />
            <Select
              value={ordering}
              onValueChange={(value) => {
                if (isPluginOrdering(value)) setOrdering(value);
              }}
            >
              <SelectTrigger aria-label={t("settings:SETTINGS_SYSTEM_PLUGINS_ORDER_LABEL")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDERINGS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(
                      `settings:SETTINGS_SYSTEM_PLUGINS_ORDER_${value.replace("-", "DESC_").toUpperCase()}`,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("common:REFRESH")}
            loading={pluginsQuery.isFetching && !pluginsQuery.isLoading}
            onClick={() => void pluginsQuery.refetch()}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>

        <ContentGuard
          loading={pluginsQuery.isLoading}
          error={catalogNotConfigured ? null : pluginsQuery.error}
          onRetry={() => void pluginsQuery.refetch()}
          empty={catalogNotConfigured || pluginsQuery.data?.length === 0}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyExtra={
            hasSearch && !catalogNotConfigured ? (
              <Button type="button" variant="outline" onClick={() => setSearch("")}>
                {t("settings:SETTINGS_SYSTEM_PLUGINS_RESET_SEARCH")}
              </Button>
            ) : undefined
          }
        >
          <div className="grid gap-4 pb-8 pt-5 md:grid-cols-2 xl:grid-cols-3">
            {pluginsQuery.data?.map((plugin) => (
              <PluginCard key={plugin.name} plugin={plugin} onOpen={setDetailPlugin} />
            ))}
          </div>
        </ContentGuard>
      </DefaultPage>

      <PluginDetailDrawer
        plugin={detailPlugin}
        onOpenChange={(open) => {
          if (!open) setDetailPlugin(null);
        }}
      />
      <PluginManualInstallDialog open={manualInstallOpen} onOpenChange={setManualInstallOpen} />
    </>
  );
}
