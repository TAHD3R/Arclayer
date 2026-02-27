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
import {
  ExtensionDetailPage,
  findExtensionBySlug,
} from "@/components/extensions/extension-detail-page";
import { buildOrganizationPath } from "@/lib/routing/organization-routing";
import { notifyError, notifySuccessText } from "@/lib/notifications";

export function OrganizationExtensionDetailPage() {
  const { orgId: organizationId, extensionSlug } = useParams({
    from: "/o/$orgId/extensions/$extensionSlug/",
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

  const extension = useMemo(
    () => findExtensionBySlug(pluginsQuery.data?.items, extensionSlug),
    [extensionSlug, pluginsQuery.data?.items],
  );

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!extension) throw new Error("extension not found");
      const ref = String(extension.slug || extension.pluginId);
      return enabled ? enableOrganizationPlugin(ref) : disableOrganizationPlugin(ref);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organization", "pluginsCenter"] });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });

  const settingsQuery = useQuery({
    queryKey: ["organization", "plugins", extension?.slug || extension?.pluginId || "", "settings"],
    enabled: extension?.hasConfigSchema ?? false,
    queryFn: async () => {
      if (!extension) throw new Error("extension is required");
      return getOrganizationPluginSettings(String(extension.slug || extension.pluginId));
    },
    staleTime: 15 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!extension) throw new Error("extension is required");
      return patchOrganizationPluginSettings(String(extension.slug || extension.pluginId), patch);
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: [
          "organization",
          "plugins",
          extension?.slug || extension?.pluginId || "",
          "settings",
        ],
      });
    },
    onError: (err) => notifyError(err),
  });

  const loading = pluginsQuery.isLoading && !pluginsQuery.data;
  const loadError = pluginsQuery.isError ? pluginsQuery.error : null;

  return (
    <ExtensionDetailPage
      extensionSlug={extensionSlug}
      extension={extension}
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
