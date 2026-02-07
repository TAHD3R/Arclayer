import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, Switch, Typography } from "antd";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { listWorkspacePlugins, enableWorkspacePlugin, disableWorkspacePlugin } from "@/api/workspace-plugins";
import { getSystemRuntime } from "@/api/system";
import { getSystemSettingsNamespace, patchSystemSettingsNamespace } from "@/api/settings";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { PluginSettingsForm } from "@/components/plugins/plugin-settings-form";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/w/$workspaceId/plugins/$pluginSlug/")({
  component: WorkspacePluginDetailPage,
});

function WorkspacePluginDetailPage() {
  const { t } = useTranslation(["nav", "plugin", "common", "settings"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, pluginSlug } = Route.useParams();

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

  const plugin = useMemo(() => {
    const items = pluginsQuery.data?.items ?? [];
    const normalized = String(pluginSlug || "").trim().toLowerCase();
    return items.find((p) => String(p.slug || p.pluginId).trim().toLowerCase() === normalized) ?? null;
  }, [pluginSlug, pluginsQuery.data?.items]);

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!plugin) throw new Error("plugin not found");
      const ref = plugin.slug || plugin.pluginId;
      return enabled
        ? enableWorkspacePlugin(workspaceId, ref)
        : disableWorkspacePlugin(workspaceId, ref);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace", "pluginsCenter", workspaceId] });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });

  const systemSettingsEnabled = Boolean(runtimeQuery.data?.capabilities?.deploymentSettingsEnabled);
  const systemDeploymentMode = runtimeQuery.data?.deploymentMode;

  const namespace = plugin ? `plugin:${plugin.pluginId}` : null;
  const settingsQuery = useQuery({
    queryKey: ["settings", "system", namespace],
    enabled: Boolean(systemSettingsEnabled && namespace),
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
    <DefaultPage
      title={`${t("nav:NAV_PLUGINS")} / ${pluginSlug}`}
      description={t("plugin:PLUGIN_CENTER_DESC")}
      width="fixed"
      action={
        <Button variant="secondary" onClick={() => void navigate({ to: `/w/${workspaceId}/plugins/installed` })}>
          {t("common:BACK")}
        </Button>
      }
    >
      <PageState
        loading={loading}
        error={loadError}
        onRetry={loadError ? () => void pluginsQuery.refetch() : undefined}
      >
        {plugin ? (
          <div className="flex flex-col gap-4">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
                    {plugin.name}
                  </Typography.Title>
                  <Typography.Paragraph style={{ marginBottom: 0 }}>
                    {plugin.description || t("common:NA")}
                  </Typography.Paragraph>
                  <div className="text-sm text-muted-foreground mt-2">
                    {t("plugin:PLUGIN_CENTER_VERSION", { version: plugin.version })}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Switch
                    checked={plugin.enabled}
                    onChange={(checked) => void toggleMutation.mutateAsync(checked)}
                    loading={toggleMutation.isPending}
                  />
                </div>
              </div>
            </Card>

            <Card title={t("settings:SETTINGS_SAVE")} size="small">
              {!systemSettingsEnabled || systemDeploymentMode === "saas" ? (
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {t("plugin:PLUGIN_SETTINGS_MANAGED_BY_PLATFORM")}
                </Typography.Paragraph>
              ) : settingsQuery.isLoading && !settingsQuery.data ? (
                <PageState loading loadingVariant="form" />
              ) : settingsQuery.isError ? (
                <PageState
                  loading={false}
                  error={settingsQuery.error}
                  onRetry={() => void settingsQuery.refetch()}
                />
              ) : settingsQuery.data ? (
                <PluginSettingsForm
                  detail={settingsQuery.data}
                  disabled={patchMutation.isPending}
                  saving={patchMutation.isPending}
                  onSubmitPatch={async (patch) => {
                    await patchMutation.mutateAsync(patch);
                  }}
                />
              ) : (
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  {t("plugin:PLUGIN_CONFIG_NOT_SUPPORTED")}
                </Typography.Paragraph>
              )}
            </Card>
          </div>
        ) : (
          <PageState
            loading={false}
            empty
            emptyTitle={t("plugin:PLUGIN_NOT_FOUND")}
            emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
          />
        )}
      </PageState>
    </DefaultPage>
  );
}
