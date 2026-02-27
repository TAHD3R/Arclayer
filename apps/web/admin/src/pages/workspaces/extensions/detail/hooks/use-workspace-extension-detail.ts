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
import {
  findExtensionBySlug,
  type ExtensionDetailPageProps,
} from "@/pages/_shared/extensions/components/extension-detail-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  systemRuntimeQueryKey,
  systemSettingsNamespaceQueryKey,
  workspacePluginsCenterQueryKey,
} from "@/lib/extensions/query-keys";

type UseWorkspaceExtensionDetailParams = {
  workspaceId: string;
  extensionSlug: string;
};

export function useWorkspaceExtensionDetail({
  workspaceId,
  extensionSlug,
}: UseWorkspaceExtensionDetailParams): ExtensionDetailPageProps {
  const { t } = useTranslation(["settings"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const runtimeQuery = useQuery({
    queryKey: systemRuntimeQueryKey(),
    queryFn: async () => getSystemRuntime(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const pluginsQuery = useQuery({
    queryKey: workspacePluginsCenterQueryKey(workspaceId),
    queryFn: async () => listWorkspacePlugins(workspaceId),
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
      const ref = extension.slug || extension.pluginId;
      return enabled
        ? enableWorkspacePlugin(workspaceId, ref)
        : disableWorkspacePlugin(workspaceId, ref);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workspacePluginsCenterQueryKey(workspaceId),
      });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });

  const systemDeploymentMode = runtimeQuery.data?.deploymentMode;
  const platformManaged = systemDeploymentMode === "saas";

  const namespace = extension ? `plugin:${extension.pluginId}` : null;
  const settingsQuery = useQuery({
    queryKey: systemSettingsNamespaceQueryKey(namespace ?? ""),
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
      if (!namespace) return;
      await queryClient.invalidateQueries({
        queryKey: systemSettingsNamespaceQueryKey(namespace),
      });
    },
    onError: (err) => notifyError(err),
  });

  const loading = pluginsQuery.isLoading && !pluginsQuery.data;
  const loadError = pluginsQuery.isError ? pluginsQuery.error : null;

  return {
    extensionSlug,
    extension,
    loading,
    loadError,
    onRetryLoad: loadError ? () => void pluginsQuery.refetch() : undefined,
    onBack: () => void navigate({ to: `/w/${workspaceId}/extensions` }),
    onToggleEnabled: async (enabled) => toggleMutation.mutateAsync(enabled),
    togglePending: toggleMutation.isPending,
    canManage: true,
    settingsDetail: settingsQuery.data,
    settingsLoading: settingsQuery.isLoading,
    settingsError: settingsQuery.isError ? settingsQuery.error : null,
    onRetrySettings: () => void settingsQuery.refetch(),
    onSubmitPatch: async (patch) => {
      await patchMutation.mutateAsync(patch);
    },
    patchPending: patchMutation.isPending,
    tabPrefix: "system",
    settingsManagedByPlatform: platformManaged,
  };
}
