import { useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import {
  disableOrganizationPlugin,
  enableOrganizationPlugin,
  getOrganizationPluginSettings,
  listOrganizationPlugins,
  patchOrganizationPluginSettings,
} from "@/api/org-plugins";
import { PluginDetailPage, findPluginBySlug } from "@/components/plugins/plugin-detail-page";
import { buildOrganizationPath } from "@/lib/organization-routing";
import { notifyError, notifySuccessText } from "@/lib/notifications";

export function OrganizationExtensionDetailPage() {
  const { orgId: organizationId, pluginSlug } = useParams({
    from: "/o/$orgId/extensions/$pluginSlug/",
  });
  const { t } = useTranslation(["settings"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const myOrganizationQuery = useQuery({
    queryKey: ["me", "organization", "plugin-detail"],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const canManage =
    myOrganizationQuery.data?.membership?.role === "owner" ||
    myOrganizationQuery.data?.membership?.role === "admin";

  const pluginsQuery = useQuery({
    queryKey: ["organization", "pluginsCenter"],
    queryFn: async () => listOrganizationPlugins(),
    staleTime: 15 * 1000,
    retry: false,
  });

  const plugin = useMemo(
    () => findPluginBySlug(pluginsQuery.data?.items, pluginSlug),
    [pluginSlug, pluginsQuery.data?.items],
  );

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!plugin) throw new Error("plugin not found");
      const ref = String(plugin.slug || plugin.pluginId);
      return enabled ? enableOrganizationPlugin(ref) : disableOrganizationPlugin(ref);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organization", "pluginsCenter"] });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });

  const settingsQuery = useQuery({
    queryKey: ["organization", "plugins", plugin?.slug || plugin?.pluginId || "", "settings"],
    enabled: plugin?.hasConfigSchema ?? false,
    queryFn: async () => {
      if (!plugin) throw new Error("plugin is required");
      return getOrganizationPluginSettings(String(plugin.slug || plugin.pluginId));
    },
    staleTime: 15 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!plugin) throw new Error("plugin is required");
      return patchOrganizationPluginSettings(String(plugin.slug || plugin.pluginId), patch);
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["organization", "plugins", plugin?.slug || plugin?.pluginId || "", "settings"],
      });
    },
    onError: (err) => notifyError(err),
  });

  const loading = pluginsQuery.isLoading && !pluginsQuery.data;
  const loadError = pluginsQuery.isError ? pluginsQuery.error : null;

  return (
    <PluginDetailPage
      pluginSlug={pluginSlug}
      plugin={plugin}
      loading={loading}
      loadError={loadError}
      onRetryLoad={loadError ? () => void pluginsQuery.refetch() : undefined}
      onBack={() => void navigate({ to: buildOrganizationPath(organizationId, "/extensions") })}
      onToggleEnabled={async (enabled) => toggleMutation.mutateAsync(enabled)}
      togglePending={toggleMutation.isPending}
      canManage={canManage}
      settingsDetail={settingsQuery.data}
      settingsLoading={settingsQuery.isLoading}
      settingsError={settingsQuery.isError ? settingsQuery.error : null}
      onRetrySettings={() => void settingsQuery.refetch()}
      onSubmitPatch={async (patch) => {
        await patchMutation.mutateAsync(patch);
      }}
      patchPending={patchMutation.isPending}
      tabPrefix="org"
      settingsManagedByPlatform={false}
    />
  );
}
