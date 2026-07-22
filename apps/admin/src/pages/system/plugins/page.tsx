import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Box, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listSystemPlugins, SYSTEM_PLUGINS_QUERY_KEY } from "@/api/plugins";
import { BaseTag } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@arclayer/ui/card";

export function SystemPluginsPage() {
  const { t } = useTranslation(["settings", "common"]);
  const pluginsQuery = useQuery({
    queryKey: SYSTEM_PLUGINS_QUERY_KEY,
    queryFn: ({ signal }) => listSystemPlugins(signal),
    retry: false,
  });

  return (
    <DefaultPage
      title={t("settings:SETTINGS_SYSTEM_PLUGINS_PAGE_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_PLUGINS_PAGE_DESC")}
    >
      <ContentGuard
        loading={pluginsQuery.isLoading}
        error={pluginsQuery.error}
        onRetry={() => void pluginsQuery.refetch()}
        empty={pluginsQuery.data?.length === 0}
        emptyTitle={t("settings:SETTINGS_SYSTEM_PLUGINS_EMPTY_TITLE")}
        emptyDescription={t("settings:SETTINGS_SYSTEM_PLUGINS_EMPTY_DESC")}
      >
        <div className="grid gap-4 pb-8 md:grid-cols-2 xl:grid-cols-3">
          {pluginsQuery.data?.map((plugin) => {
            const capabilityCount =
              plugin.provides.services.length +
              plugin.provides.providers.length +
              plugin.provides.connectors.length +
              plugin.provides.middlewares.length +
              plugin.provides.contentTypes.length;
            return (
              <Card key={plugin.name} className="flex min-h-56 flex-col">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/35">
                        <Box className="size-4 text-label-secondary" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-headline">
                          {plugin.admin?.labelKey ? t(plugin.admin.labelKey) : plugin.name}
                        </CardTitle>
                        <div className="mt-0.5 font-mono text-caption text-label-secondary">
                          {plugin.name} · v{plugin.version}
                        </div>
                      </div>
                    </div>
                    <BaseTag color={plugin.processState === "ready" ? "green" : "gold"}>
                      {t(
                        `settings:SETTINGS_SYSTEM_PLUGIN_STATE_${plugin.processState.toUpperCase()}`,
                      )}
                    </BaseTag>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-callout text-label-secondary">
                    {plugin.admin?.descriptionKey
                      ? t(plugin.admin.descriptionKey)
                      : t("settings:SETTINGS_SYSTEM_PLUGIN_NO_DESCRIPTION")}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <BaseTag>
                      {t("settings:SETTINGS_SYSTEM_PLUGIN_CAPABILITIES", {
                        count: capabilityCount,
                      })}
                    </BaseTag>
                    {plugin.permissions.length ? (
                      <BaseTag color="gold">
                        {t("settings:SETTINGS_SYSTEM_PLUGIN_PERMISSIONS", {
                          count: plugin.permissions.length,
                        })}
                      </BaseTag>
                    ) : null}
                  </div>
                </CardContent>
                {plugin.admin?.settingsPath ? (
                  <CardFooter className="justify-end border-t border-border/70 pt-4">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={plugin.admin.settingsPath}>
                        <Settings2 data-icon="inline-start" />
                        {t("settings:SETTINGS_SYSTEM_PLUGIN_CONFIGURE")}
                      </Link>
                    </Button>
                  </CardFooter>
                ) : null}
              </Card>
            );
          })}
        </div>
      </ContentGuard>
    </DefaultPage>
  );
}
