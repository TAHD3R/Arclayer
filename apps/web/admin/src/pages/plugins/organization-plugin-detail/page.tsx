import { Button, Card, Descriptions, Switch, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { getMyOrganization } from "@/api/me";
import {
  disableOrganizationPlugin,
  enableOrganizationPlugin,
  getOrganizationPluginSettings,
  listOrganizationPlugins,
  patchOrganizationPluginSettings,
} from "@/api/org-plugins";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { PluginSettingsForm } from "@/components/plugins/plugin-settings-form";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";

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

type OrganizationPluginDetailViewProps = {
  pluginSlug: string;
};

export function OrganizationPluginDetailView({ pluginSlug }: OrganizationPluginDetailViewProps) {
  const { t } = useTranslation(["nav", "plugin", "common", "settings"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("details");

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
      const ref = String(plugin.slug || plugin.pluginId);
      return enabled ? enableOrganizationPlugin(ref) : disableOrganizationPlugin(ref);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization", "pluginsCenter"],
      });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });

  const settingsQuery = useQuery({
    queryKey: ["organization", "plugins", plugin?.slug || plugin?.pluginId || "", "settings"],
    enabled: Boolean(plugin?.hasConfigSchema),
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

  const configSections = useMemo(() => {
    const sections = settingsQuery.data?.settingSchema?.sections || [];
    return sections.filter((s) => (s.fields || []).length > 0);
  }, [settingsQuery.data?.settingSchema?.sections]);

  const status = normalizeStatus(plugin?.status);
  const statusLabel = plugin
    ? t(`plugin:PLUGIN_STATUS_${status.toUpperCase()}`, { defaultValue: plugin.status })
    : null;
  const availableTabs = useMemo(() => {
    const keys = ["details"];
    if (configSections.length > 0) {
      for (const s of configSections) keys.push(`org:${s.id}`);
    } else if (Boolean(plugin?.hasConfigSchema)) {
      keys.push("org:config");
    }
    return keys;
  }, [configSections, plugin?.hasConfigSchema]);

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
          <Button onClick={() => void navigate({ to: "/plugins/installed" })}>{t("common:BACK")}</Button>
          {plugin ? (
            <Switch
              checked={plugin.enabled}
              aria-label={t("plugin:PLUGIN_CENTER_TOGGLE_ARIA", { name: plugin.name })}
              onChange={(checked) => void toggleMutation.mutateAsync(checked)}
              loading={toggleMutation.isPending}
              disabled={!canManage || toggleMutation.isPending}
            />
          ) : null}
        </div>
      }
    >
      <PageState
        loading={loading}
        loadingVariant="form"
        error={loadError}
        onRetry={() => void pluginsQuery.refetch()}
      >
        {plugin ? (
          <ChromeTabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <ChromeTabsList>
              <ChromeTabsTrigger value="details">{t("plugin:PLUGIN_TAB_DETAILS")}</ChromeTabsTrigger>
              {configSections.length ? (
                configSections.map((s) => (
                  <ChromeTabsTrigger key={s.id} value={`org:${s.id}`}>
                    {s.title || s.id}
                  </ChromeTabsTrigger>
                ))
              ) : Boolean(plugin.hasConfigSchema) ? (
                <ChromeTabsTrigger value="org:config">{t("plugin:PLUGIN_TAB_CONFIG")}</ChromeTabsTrigger>
              ) : null}
            </ChromeTabsList>

            <ChromeTabsContent value="details">
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
                    {plugin.enabled ? t("plugin:PLUGIN_ENABLED_TRUE") : t("plugin:PLUGIN_ENABLED_FALSE")}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </ChromeTabsContent>

            {configSections.length
              ? configSections.map((section) => (
                  <ChromeTabsContent key={section.id} value={`org:${section.id}`}>
                    {settingsQuery.isLoading && !settingsQuery.data ? (
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
                        disabled={patchMutation.isPending || !canManage}
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

            {Boolean(plugin.hasConfigSchema) ? (
              <ChromeTabsContent value="org:config">
                {settingsQuery.isLoading && !settingsQuery.data ? (
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
                    disabled={patchMutation.isPending || !canManage}
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
