import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, Descriptions, Switch, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import {
  listWorkspacePlugins,
  enableWorkspacePlugin,
  disableWorkspacePlugin,
} from "@/api/workspace-plugins";
import { getSystemRuntime } from "@/api/system";
import { getSystemSettingsNamespace, patchSystemSettingsNamespace } from "@/api/settings";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { PluginSettingsForm } from "@/components/plugins/plugin-settings-form";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";

export const Route = createFileRoute("/w/$workspaceId/plugins/$pluginSlug/")({
  component: WorkspacePluginDetailPage,
});

function normalizeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function categoryLabel(
  t: (key: string, opts?: { defaultValue?: string }) => string,
  code: string | null | undefined,
): string {
  const c = String(code || "")
    .trim()
    .toLowerCase();
  if (!c) return t("common:NA");
  const key = `plugin:PLUGIN_CATEGORY_${c.toUpperCase()}` as const;
  return t(key, { defaultValue: c });
}

function WorkspacePluginDetailPage() {
  const { t } = useTranslation(["nav", "plugin", "common", "settings"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, pluginSlug } = Route.useParams();
  const [tab, setTab] = useState<string>("details");

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
    const normalized = String(pluginSlug || "")
      .trim()
      .toLowerCase();
    return (
      items.find(
        (p) =>
          String(p.slug || p.pluginId)
            .trim()
            .toLowerCase() === normalized,
      ) ?? null
    );
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

  const configSections = useMemo(() => {
    const sections = settingsQuery.data?.settingSchema?.sections || [];
    return sections.filter((s) => (s.fields || []).length > 0);
  }, [settingsQuery.data?.settingSchema?.sections]);

  const status = normalizeStatus(plugin?.status);
  const hasConfigSchema = plugin?.hasConfigSchema ?? false;
  const statusLabel = plugin
    ? t(`plugin:PLUGIN_STATUS_${status.toUpperCase()}`, { defaultValue: plugin.status })
    : null;
  const availableTabs = useMemo(() => {
    const keys = ["details"];
    if (configSections.length > 0) {
      for (const s of configSections) keys.push(`system:${s.id}`);
    } else if (hasConfigSchema) {
      keys.push("system:config");
    }
    return keys;
  }, [configSections, hasConfigSchema]);

  useEffect(() => {
    if (!availableTabs.includes(tab)) setTab("details");
  }, [availableTabs, tab]);

  return (
    <DefaultPage
      title={plugin ? plugin.name : `${t("nav:NAV_PLUGINS")} / ${pluginSlug}`}
      description={plugin?.description || t("common:NA")}
      width="fixed"
      action={
        <div className="flex items-center gap-3">
          <Button onClick={() => void navigate({ to: `/w/${workspaceId}/plugins/installed` })}>
            {t("common:BACK")}
          </Button>
          {plugin ? (
            <Switch
              checked={plugin.enabled}
              aria-label={t("plugin:PLUGIN_CENTER_TOGGLE_ARIA", { name: plugin.name })}
              onChange={(checked) => void toggleMutation.mutateAsync(checked)}
              loading={toggleMutation.isPending}
            />
          ) : null}
        </div>
      }
    >
      <PageState
        loading={loading}
        error={loadError}
        onRetry={loadError ? () => void pluginsQuery.refetch() : undefined}
      >
        {plugin ? (
          <ChromeTabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <ChromeTabsList>
              <ChromeTabsTrigger value="details">
                {t("plugin:PLUGIN_TAB_DETAILS")}
              </ChromeTabsTrigger>
              {configSections.length ? (
                configSections.map((s) => (
                  <ChromeTabsTrigger key={s.id} value={`system:${s.id}`}>
                    {s.title || s.id}
                  </ChromeTabsTrigger>
                ))
              ) : hasConfigSchema ? (
                <ChromeTabsTrigger value="system:config">
                  {t("plugin:PLUGIN_TAB_CONFIG")}
                </ChromeTabsTrigger>
              ) : null}
            </ChromeTabsList>

            <ChromeTabsContent value="details">
              <div className="flex flex-col gap-4">
                <Card size="small" type="inner" title={t("plugin:PLUGIN_TAB_DETAILS")}>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_ID")}>
                      <Typography.Text code>{plugin.pluginId}</Typography.Text>
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_SLUG")}>
                      <Typography.Text code>{plugin.slug || t("common:NA")}</Typography.Text>
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_VERSION")}>
                      {plugin.version}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_REQUIRES")}>
                      {plugin.requires || t("common:NA")}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_AUTHOR")}>
                      {plugin.author || t("common:NA")}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_LICENSE")}>
                      {plugin.license || t("common:NA")}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_STATUS")}>
                      {statusLabel || t("common:NA")}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_CATEGORY")}>
                      {plugin.category ? categoryLabel(t, plugin.category) : t("common:NA")}
                    </Descriptions.Item>
                    <Descriptions.Item label={t("plugin:PLUGIN_META_ENABLED")}>
                      {plugin.enabled
                        ? t("plugin:PLUGIN_ENABLED_TRUE")
                        : t("plugin:PLUGIN_ENABLED_FALSE")}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </div>
            </ChromeTabsContent>

            {configSections.length
              ? configSections.map((section) => (
                  <ChromeTabsContent key={section.id} value={`system:${section.id}`}>
                    {platformManaged ? (
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
                        sectionId={section.id}
                        disabled={patchMutation.isPending || platformManaged}
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
                  </ChromeTabsContent>
                ))
              : null}

            {hasConfigSchema ? (
              <ChromeTabsContent value="system:config">
                {platformManaged ? (
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
                    disabled={patchMutation.isPending || platformManaged}
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
              </ChromeTabsContent>
            ) : null}
          </ChromeTabs>
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
