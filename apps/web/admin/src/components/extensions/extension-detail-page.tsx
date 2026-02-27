import { Button, Card, Descriptions, Switch, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SystemSettingsDetail } from "@/types/api";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { ExtensionSettingsForm } from "@/components/extensions/extension-settings-form";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";

export type ExtensionDetailItem = {
  pluginId: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  version: string;
  requires?: string | null;
  author: string;
  license?: string | null;
  status: string;
  category?: string | null;
  hasConfigSchema?: boolean;
  enabled: boolean;
};

export type ExtensionDetailPageProps = {
  extensionSlug: string;
  extension: ExtensionDetailItem | null;
  loading: boolean;
  loadError: unknown;
  onRetryLoad?: () => void;
  onBack: () => void;
  onToggleEnabled: (enabled: boolean) => Promise<unknown>;
  togglePending: boolean;
  canManage: boolean;
  settingsDetail: SystemSettingsDetail | undefined;
  settingsLoading: boolean;
  settingsError: unknown;
  onRetrySettings: () => void;
  onSubmitPatch: (patch: Record<string, unknown>) => Promise<void>;
  patchPending: boolean;
  tabPrefix: string;
  settingsManagedByPlatform?: boolean;
};

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

export function findExtensionBySlug<T extends { pluginId: string; slug?: string | null }>(
  items: T[] | undefined,
  extensionSlug: string,
): T | null {
  const list = items ?? [];
  const normalized = String(extensionSlug || "")
    .trim()
    .toLowerCase();
  return (
    list.find(
      (item) =>
        String(item.slug || item.pluginId)
          .trim()
          .toLowerCase() === normalized,
    ) ?? null
  );
}

export function ExtensionDetailPage(props: ExtensionDetailPageProps) {
  const { t } = useTranslation(["nav", "plugin", "common", "settings"]);
  const [tab, setTab] = useState<string>("details");

  const configSections = useMemo(() => {
    const sections = props.settingsDetail?.settingSchema?.sections || [];
    return sections.filter((section) => (section.fields || []).length > 0);
  }, [props.settingsDetail?.settingSchema?.sections]);

  const status = normalizeStatus(props.extension?.status);
  const hasConfigSchema = props.extension?.hasConfigSchema ?? false;
  const statusLabel = props.extension
    ? t(`plugin:PLUGIN_STATUS_${status.toUpperCase()}`, { defaultValue: props.extension.status })
    : null;

  const detailsTab = "details";
  const configTabKey = `${props.tabPrefix}:config`;

  const availableTabs = useMemo(() => {
    const keys = [detailsTab];
    if (configSections.length > 0) {
      for (const section of configSections) {
        keys.push(`${props.tabPrefix}:${section.id}`);
      }
    } else if (hasConfigSchema) {
      keys.push(configTabKey);
    }
    return keys;
  }, [configSections, configTabKey, hasConfigSchema, props.tabPrefix]);

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(detailsTab);
    }
  }, [availableTabs, tab]);

  const settingsDisabled =
    props.patchPending || !props.canManage || Boolean(props.settingsManagedByPlatform);

  const renderSettingsTabBody = (sectionId?: string) => {
    if (props.settingsManagedByPlatform) {
      return (
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t("plugin:PLUGIN_SETTINGS_MANAGED_BY_PLATFORM")}
        </Typography.Paragraph>
      );
    }
    if (props.settingsLoading && !props.settingsDetail) {
      return <ContentGuard loading loadingVariant="form" />;
    }
    if (props.settingsError) {
      return (
        <ContentGuard loading={false} error={props.settingsError} onRetry={props.onRetrySettings} />
      );
    }
    if (!props.settingsDetail) {
      return (
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t("plugin:PLUGIN_CONFIG_NOT_SUPPORTED")}
        </Typography.Paragraph>
      );
    }
    return (
      <ExtensionSettingsForm
        detail={props.settingsDetail}
        sectionId={sectionId}
        disabled={settingsDisabled}
        saving={props.patchPending}
        onSubmitPatch={props.onSubmitPatch}
      />
    );
  };

  return (
    <DefaultPage
      title={
        props.extension ? props.extension.name : `${t("nav:NAV_PLUGINS")} / ${props.extensionSlug}`
      }
      description={props.extension?.description || t("common:NA")}
      width="fixed"
      action={
        <div className="flex items-center gap-3">
          <Button onClick={props.onBack}>{t("common:BACK")}</Button>
          {props.extension ? (
            <Switch
              checked={props.extension.enabled}
              aria-label={t("plugin:PLUGIN_CENTER_TOGGLE_ARIA", { name: props.extension.name })}
              onChange={(checked) => void props.onToggleEnabled(checked)}
              loading={props.togglePending}
              disabled={!props.canManage || props.togglePending}
            />
          ) : null}
        </div>
      }
    >
      <ContentGuard loading={props.loading} error={props.loadError} onRetry={props.onRetryLoad}>
        {props.extension ? (
          <ChromeTabs value={tab} onValueChange={(value) => setTab(String(value))}>
            <ChromeTabsList>
              <ChromeTabsTrigger value={detailsTab}>
                {t("plugin:PLUGIN_TAB_DETAILS")}
              </ChromeTabsTrigger>
              {configSections.length > 0
                ? configSections.map((section) => (
                    <ChromeTabsTrigger key={section.id} value={`${props.tabPrefix}:${section.id}`}>
                      {section.title || section.id}
                    </ChromeTabsTrigger>
                  ))
                : null}
              {configSections.length === 0 && hasConfigSchema ? (
                <ChromeTabsTrigger value={configTabKey}>
                  {t("plugin:PLUGIN_TAB_CONFIG")}
                </ChromeTabsTrigger>
              ) : null}
            </ChromeTabsList>

            <ChromeTabsContent value={detailsTab}>
              <Card size="small" type="inner" title={t("plugin:PLUGIN_TAB_DETAILS")}>
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_ID")}>
                    <Typography.Text code>{props.extension.pluginId}</Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_SLUG")}>
                    <Typography.Text code>{props.extension.slug || t("common:NA")}</Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_VERSION")}>
                    {props.extension.version}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_REQUIRES")}>
                    {props.extension.requires || t("common:NA")}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_AUTHOR")}>
                    {props.extension.author || t("common:NA")}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_LICENSE")}>
                    {props.extension.license || t("common:NA")}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_STATUS")}>
                    {statusLabel || t("common:NA")}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_CATEGORY")}>
                    {props.extension.category
                      ? categoryLabel(t, props.extension.category)
                      : t("common:NA")}
                  </Descriptions.Item>
                  <Descriptions.Item label={t("plugin:PLUGIN_META_ENABLED")}>
                    {props.extension.enabled
                      ? t("plugin:PLUGIN_ENABLED_TRUE")
                      : t("plugin:PLUGIN_ENABLED_FALSE")}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </ChromeTabsContent>

            {configSections.map((section) => (
              <ChromeTabsContent key={section.id} value={`${props.tabPrefix}:${section.id}`}>
                {renderSettingsTabBody(section.id)}
              </ChromeTabsContent>
            ))}

            {hasConfigSchema ? (
              <ChromeTabsContent value={configTabKey}>{renderSettingsTabBody()}</ChromeTabsContent>
            ) : null}
          </ChromeTabs>
        ) : (
          <ContentGuard
            loading={false}
            empty
            emptyTitle={t("plugin:PLUGIN_NOT_FOUND")}
            emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
          />
        )}
      </ContentGuard>
    </DefaultPage>
  );
}
