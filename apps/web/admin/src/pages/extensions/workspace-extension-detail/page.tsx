import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  disableWorkspacePlugin,
  enableWorkspacePlugin,
  listWorkspacePlugins,
} from "@/api/workspace-plugins";
import { getSystemRuntime } from "@/api/system";
import { getSystemSettingsNamespace, patchSystemSettingsNamespace } from "@/api/settings";
import { PluginDetailPage, findPluginBySlug } from "@/components/plugins/plugin-detail-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";

type WorkspaceExtensionDetailPageProps = {
  workspaceId: string;
  pluginSlug: string;
};

export function WorkspaceExtensionDetailPage(props: WorkspaceExtensionDetailPageProps) {
  const { workspaceId, pluginSlug } = props;
  const { t } = useTranslation(["settings"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const runtimeQuery = useQuery({
    queryKey: ["system", "runtime"],
    queryFn: async () => getSystemRuntime(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const pluginsQuery = useQuery({
    queryKey: ["workspace", "pluginsCenter", workspaceId],
    queryFn: async () => listWorkspacePlugins(workspaceId),
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
      const ref = plugin.slug || plugin.pluginId;
      return enabled
        ? enableWorkspacePlugin(workspaceId, ref)
        : disableWorkspacePlugin(workspaceId, ref);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "pluginsCenter", workspaceId],
      });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });

  const systemDeploymentMode = runtimeQuery.data?.deploymentMode;
  const platformManaged = systemDeploymentMode === "saas";

  const namespace = plugin ? `plugin:${plugin.pluginId}` : null;
  const settingsQuery = useQuery({
    queryKey: ["settings", "system", namespace],
    enabled: namespace !== null,
    queryFn: async () => {
      if (!namespace) throw new Error("namespace is required");
      return getSystemSettingsNamespace(namespace);
    },
    staleTime: 15 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!namespace) throw new Error("namespace is required");
      return patchSystemSettingsNamespace(namespace, patch);
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "system", namespace] });
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
      onBack={() => void navigate({ to: `/w/${workspaceId}/extensions` })}
      onToggleEnabled={async (enabled) => toggleMutation.mutateAsync(enabled)}
      togglePending={toggleMutation.isPending}
      canManage
      settingsDetail={settingsQuery.data}
      settingsLoading={settingsQuery.isLoading}
      settingsError={settingsQuery.isError ? settingsQuery.error : null}
      onRetrySettings={() => void settingsQuery.refetch()}
      onSubmitPatch={async (patch) => {
        await patchMutation.mutateAsync(patch);
      }}
      patchPending={patchMutation.isPending}
      tabPrefix="system"
      settingsManagedByPlatform={platformManaged}
    />
  );
}
