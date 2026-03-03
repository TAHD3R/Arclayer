import { Form, Input, Switch, Typography } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";
import { deleteAdminAssetUsageByRef, upsertAdminAssetUsage } from "@/api/asset-usages";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import type { GeneralSettingsFormValues } from "@/types/settings-general";
import { SiteSettingsAssetField } from "./site-settings-asset-field";
import { SeoTitlePolicyField } from "./seo-title-policy-field";
import { LocalizedStringDictField } from "./localized-string-dict-field";
import { formatSummaryText, normalizeOptionalString } from "@/lib/settings/general/utils";

type SiteSettingsTabProps = GeneralSettingsTabBaseProps;

function useSiteField(
  form: FormInstance<GeneralSettingsFormValues>,
  name: keyof GeneralSettingsFormValues,
) {
  return Form.useWatch(name as string, form) as unknown;
}

export function SiteSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
}: SiteSettingsTabProps) {
  const { t } = useTranslation();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);

  // useWatch 在字段未挂载（例如折叠未展开）时可能不触发，这里对齐旧实现：fallback 到初始值。
  const siteName = (useSiteField(form, "siteName") as string | undefined) ?? initialValues.siteName;
  const siteNameI18nEnabled =
    (useSiteField(form, "siteNameI18nEnabled") as boolean | undefined) ??
    initialValues.siteNameI18nEnabled;
  const siteNameI18n =
    (useSiteField(form, "siteNameI18n") as Record<string, string> | undefined) ??
    initialValues.siteNameI18n;
  const siteSubtitle =
    (useSiteField(form, "siteSubtitle") as string | undefined) ?? initialValues.siteSubtitle;
  const siteDescription =
    (useSiteField(form, "siteDescription") as string | undefined) ?? initialValues.siteDescription;
  const siteDescriptionI18nEnabled =
    (useSiteField(form, "siteDescriptionI18nEnabled") as boolean | undefined) ??
    initialValues.siteDescriptionI18nEnabled;
  const siteDescriptionI18n =
    (useSiteField(form, "siteDescriptionI18n") as Record<string, string> | undefined) ??
    initialValues.siteDescriptionI18n;
  const siteUrl = (useSiteField(form, "siteUrl") as string | undefined) ?? initialValues.siteUrl;
  const siteLogoUrl =
    (useSiteField(form, "siteLogoUrl") as string | undefined) ?? initialValues.siteLogoUrl;
  const siteLogoAssetId =
    (useSiteField(form, "siteLogoAssetId") as string | undefined) ?? initialValues.siteLogoAssetId;
  const siteFaviconUrl =
    (useSiteField(form, "siteFaviconUrl") as string | undefined) ?? initialValues.siteFaviconUrl;
  const siteFaviconAssetId =
    (useSiteField(form, "siteFaviconAssetId") as string | undefined) ??
    initialValues.siteFaviconAssetId;
  const siteContactEmail =
    (useSiteField(form, "siteContactEmail") as string | undefined) ??
    initialValues.siteContactEmail;
  const seoTitlePolicyV1 =
    (useSiteField(form, "seoTitlePolicyV1") as
      | GeneralSettingsFormValues["seoTitlePolicyV1"]
      | undefined) ?? initialValues.seoTitlePolicyV1;
  const supportedLocales =
    (useSiteField(form, "supportedLocales") as string[] | undefined) ??
    initialValues.supportedLocales;
  const defaultLocale =
    (useSiteField(form, "defaultLocale") as string | undefined) ?? initialValues.defaultLocale;

  const effectiveSiteName = siteNameI18nEnabled
    ? resolveDefaultLocaleValue(siteNameI18n, defaultLocale) || siteName
    : siteName;
  const effectiveSiteDescription = siteDescriptionI18nEnabled
    ? resolveDefaultLocaleValue(siteDescriptionI18n, defaultLocale) || siteDescription
    : siteDescription;

  const isSiteNameDirty =
    (siteName || "") !== (initialValues.siteName || "") ||
    Boolean(siteNameI18nEnabled) !== Boolean(initialValues.siteNameI18nEnabled) ||
    JSON.stringify(siteNameI18n || {}) !== JSON.stringify(initialValues.siteNameI18n || {});
  const isSiteSubtitleDirty = (siteSubtitle || "") !== (initialValues.siteSubtitle || "");
  const isSiteDescriptionDirty =
    (siteDescription || "") !== (initialValues.siteDescription || "") ||
    Boolean(siteDescriptionI18nEnabled) !== Boolean(initialValues.siteDescriptionI18nEnabled) ||
    JSON.stringify(siteDescriptionI18n || {}) !==
      JSON.stringify(initialValues.siteDescriptionI18n || {});
  const isSiteUrlDirty = (siteUrl || "") !== (initialValues.siteUrl || "");
  const isSiteLogoUrlDirty =
    (siteLogoUrl || "") !== (initialValues.siteLogoUrl || "") ||
    (siteLogoAssetId || "") !== (initialValues.siteLogoAssetId || "");
  const isSiteFaviconUrlDirty =
    (siteFaviconUrl || "") !== (initialValues.siteFaviconUrl || "") ||
    (siteFaviconAssetId || "") !== (initialValues.siteFaviconAssetId || "");
  const isSiteContactEmailDirty =
    (siteContactEmail || "") !== (initialValues.siteContactEmail || "");
  const isSeoTitlePolicyDirty =
    JSON.stringify(seoTitlePolicyV1) !== JSON.stringify(initialValues.seoTitlePolicyV1);

  const isResettingSiteName = savingKey === "reset:siteName";
  const isResettingSiteSubtitle = savingKey === "reset:siteSubtitle";
  const isResettingSiteDescription = savingKey === "reset:siteDescription";
  const isResettingSiteUrl = savingKey === "reset:siteUrl";
  const isResettingSiteLogoUrl = savingKey === "reset:siteLogoUrl";
  const isResettingSiteFaviconUrl = savingKey === "reset:siteFaviconUrl";
  const isResettingSiteContactEmail = savingKey === "reset:siteContactEmail";
  const isResettingSeoTitlePolicyV1 = savingKey === "reset:seoTitlePolicyV1";

  const resetSiteName = () =>
    withSavingKey("reset:siteName", async () => {
      form.setFieldValue("siteName", initialValues.siteName);
      form.setFieldValue("siteNameI18nEnabled", initialValues.siteNameI18nEnabled);
      form.setFieldValue("siteNameI18n", initialValues.siteNameI18n);
      await patch({
        site: {
          name: initialValues.siteName,
          name_i18n: initialValues.siteNameI18nEnabled ? initialValues.siteNameI18n : null,
        },
      });
    });

  const resetSiteSubtitle = () =>
    withSavingKey("reset:siteSubtitle", async () => {
      form.setFieldValue("siteSubtitle", initialValues.siteSubtitle);
      await patch({
        site: { subtitle: normalizeOptionalString(initialValues.siteSubtitle) },
      });
    });

  const resetSiteDescription = () =>
    withSavingKey("reset:siteDescription", async () => {
      form.setFieldValue("siteDescription", initialValues.siteDescription);
      form.setFieldValue("siteDescriptionI18nEnabled", initialValues.siteDescriptionI18nEnabled);
      form.setFieldValue("siteDescriptionI18n", initialValues.siteDescriptionI18n);
      await patch({
        site: {
          description: normalizeOptionalString(initialValues.siteDescription),
          description_i18n: initialValues.siteDescriptionI18nEnabled
            ? initialValues.siteDescriptionI18n
            : null,
        },
      });
    });

  const resetSiteUrl = () =>
    withSavingKey("reset:siteUrl", async () => {
      form.setFieldValue("siteUrl", initialValues.siteUrl);
      await patch({ site: { url: initialValues.siteUrl } });
    });

  const resetSiteLogoUrl = () =>
    withSavingKey("reset:siteLogoUrl", async () => {
      form.setFieldValue("siteLogoUrl", initialValues.siteLogoUrl);
      form.setFieldValue("siteLogoAssetId", initialValues.siteLogoAssetId);
      await patch({
        site: {
          logo_url: normalizeOptionalString(initialValues.siteLogoUrl),
          logo_asset_id: normalizeOptionalString(initialValues.siteLogoAssetId),
        },
      });

      if (initialValues.siteLogoAssetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId: initialValues.siteLogoAssetId,
          purpose: "site_logo",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      }
    });

  const resetSiteFaviconUrl = () =>
    withSavingKey("reset:siteFaviconUrl", async () => {
      form.setFieldValue("siteFaviconUrl", initialValues.siteFaviconUrl);
      form.setFieldValue("siteFaviconAssetId", initialValues.siteFaviconAssetId);
      await patch({
        site: {
          favicon_url: normalizeOptionalString(initialValues.siteFaviconUrl),
          favicon_asset_id: normalizeOptionalString(initialValues.siteFaviconAssetId),
        },
      });

      if (initialValues.siteFaviconAssetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId: initialValues.siteFaviconAssetId,
          purpose: "favicon",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      }
    });

  const resetSiteContactEmail = () =>
    withSavingKey("reset:siteContactEmail", async () => {
      form.setFieldValue("siteContactEmail", initialValues.siteContactEmail);
      await patch({
        site: { contact_email: normalizeOptionalString(initialValues.siteContactEmail) },
      });
    });

  const resetSeoTitlePolicyV1 = () =>
    withSavingKey("reset:seoTitlePolicyV1", async () => {
      form.setFieldValue("seoTitlePolicyV1", initialValues.seoTitlePolicyV1);
      await patch({
        seo: { title_policy_v1: toApiTitlePolicyV1(initialValues.seoTitlePolicyV1) },
      });
    });

  const saveSiteName = () =>
    withSavingKey("siteName", async () => {
      const values = await form.validateFields([
        "siteName",
        "siteNameI18nEnabled",
        "siteNameI18n",
        "defaultLocale",
      ]);

      const nextDefaultLocale = String(values.defaultLocale || "").trim() || defaultLocale;
      const maybeDefaultLocalePatch =
        nextDefaultLocale && nextDefaultLocale !== initialValues.defaultLocale
          ? { site_localization: { default_locale: nextDefaultLocale, locale: nextDefaultLocale } }
          : {};

      const enabled = Boolean(values.siteNameI18nEnabled);
      if (!enabled) {
        const nextName = String(values.siteName || "").trim();
        await patch(
          Object.assign({}, maybeDefaultLocalePatch, { site: { name: nextName, name_i18n: null } }),
        );
        return;
      }

      const rawMap = (values.siteNameI18n || {}) as Record<string, string>;
      const nextMap = normalizeLocalizedStringMapForSave(rawMap);
      const resolved = resolveDefaultLocaleValue(nextMap, nextDefaultLocale);
      if (!resolved) {
        throw new Error(t("settings:SETTINGS_I18N_VALIDATION_DEFAULT_REQUIRED"));
      }

      form.setFieldValue("siteNameI18n", nextMap);
      form.setFieldValue("siteName", resolved);
      await patch(
        Object.assign({}, maybeDefaultLocalePatch, {
          site: { name: resolved, name_i18n: nextMap },
        }),
      );
    });

  const saveSiteSubtitle = () =>
    withSavingKey("siteSubtitle", async () => {
      const values = await form.validateFields(["siteSubtitle"]);
      await patch({
        site: { subtitle: normalizeOptionalString(values.siteSubtitle) },
      });
    });

  const saveSiteDescription = () =>
    withSavingKey("siteDescription", async () => {
      const values = await form.validateFields([
        "siteDescription",
        "siteDescriptionI18nEnabled",
        "siteDescriptionI18n",
        "defaultLocale",
      ]);

      const nextDefaultLocale = String(values.defaultLocale || "").trim() || defaultLocale;
      const maybeDefaultLocalePatch =
        nextDefaultLocale && nextDefaultLocale !== initialValues.defaultLocale
          ? { site_localization: { default_locale: nextDefaultLocale, locale: nextDefaultLocale } }
          : {};

      const enabled = Boolean(values.siteDescriptionI18nEnabled);
      if (!enabled) {
        await patch(
          Object.assign({}, maybeDefaultLocalePatch, {
            site: {
              description: normalizeOptionalString(values.siteDescription),
              description_i18n: null,
            },
          }),
        );
        return;
      }

      const rawMap = (values.siteDescriptionI18n || {}) as Record<string, string>;
      const nextMap = normalizeLocalizedStringMapForSave(rawMap);
      form.setFieldValue("siteDescriptionI18n", nextMap);
      const resolved = resolveDefaultLocaleValue(nextMap, nextDefaultLocale);
      await patch(
        Object.assign({}, maybeDefaultLocalePatch, {
          site: {
            description: normalizeOptionalString(resolved || values.siteDescription),
            description_i18n: nextMap,
          },
        }),
      );
    });

  const saveSiteUrl = () =>
    withSavingKey("siteUrl", async () => {
      const values = await form.validateFields(["siteUrl"]);
      await patch({ site: { url: String(values.siteUrl).trim() } });
    });

  const saveSiteLogoUrl = () =>
    withSavingKey("siteLogoUrl", async () => {
      const values = await form.validateFields(["siteLogoAssetId", "siteLogoUrl"]);
      const assetId = normalizeOptionalString(values.siteLogoAssetId);
      // 兼容旧字段：当选择了资源库资产时，同时写入 logo_url=/assets/<id>，避免历史消费方只读 url。
      const url = assetId ? `/assets/${assetId}` : normalizeOptionalString(values.siteLogoUrl);

      await patch({
        site: { logo_asset_id: assetId, logo_url: url },
      });

      if (assetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId,
          purpose: "site_logo",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.logo",
        });
      }
    });

  const saveSiteFaviconUrl = () =>
    withSavingKey("siteFaviconUrl", async () => {
      const values = await form.validateFields(["siteFaviconAssetId", "siteFaviconUrl"]);
      const assetId = normalizeOptionalString(values.siteFaviconAssetId);
      const url = assetId ? `/assets/${assetId}` : normalizeOptionalString(values.siteFaviconUrl);

      await patch({
        site: { favicon_asset_id: assetId, favicon_url: url },
      });

      if (assetId) {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await upsertAdminAssetUsage(String(workspaceId), {
          assetId,
          purpose: "favicon",
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      } else {
        if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
        await deleteAdminAssetUsageByRef({
          workspaceId: String(workspaceId),
          entityType: "core.settings",
          entityId: "site",
          fieldKey: "site.favicon",
        });
      }
    });

  const siteLogoPreviewUrl = useMemo(() => {
    if (siteLogoAssetId) return resolvePublicAssetUrlPath(`/assets/${siteLogoAssetId}`);
    if (siteLogoUrl) return resolvePublicAssetUrlPath(siteLogoUrl) || siteLogoUrl;
    return undefined;
  }, [siteLogoAssetId, siteLogoUrl]);

  const siteFaviconPreviewUrl = useMemo(() => {
    if (siteFaviconAssetId) return resolvePublicAssetUrlPath(`/assets/${siteFaviconAssetId}`);
    if (siteFaviconUrl) return resolvePublicAssetUrlPath(siteFaviconUrl) || siteFaviconUrl;
    return undefined;
  }, [siteFaviconAssetId, siteFaviconUrl]);

  const saveSiteContactEmail = () =>
    withSavingKey("siteContactEmail", async () => {
      const values = await form.validateFields(["siteContactEmail"]);
      await patch({
        site: { contact_email: normalizeOptionalString(values.siteContactEmail) },
      });
    });

  const saveSeoTitlePolicyV1 = () =>
    withSavingKey("seoTitlePolicyV1", async () => {
      const values = await form.validateFields(["seoTitlePolicyV1"]);
      const nextRaw = (values.seoTitlePolicyV1 ??
        initialValues.seoTitlePolicyV1) as GeneralSettingsFormValues["seoTitlePolicyV1"];
      const next = normalizeTitlePolicyV1ForSave(nextRaw, t);
      await patch({
        seo: { title_policy_v1: toApiTitlePolicyV1(next) },
      });
    });

  return (
    <>
      <Form.Item<GeneralSettingsFormValues> name="defaultLocale" hidden>
        <Input />
      </Form.Item>
      <Accordion type="single" collapsible className="px-0">
        <SettingAccordionItem
          value="siteName"
          title={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
          description={t("settings:SETTINGS_SITE_NAME_DESC")}
          showSummary
          summary={formatSummaryText(effectiveSiteName)}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSiteName}
          confirmLoading={savingKey === "siteName"}
          onReset={isSiteNameDirty || isResettingSiteName ? resetSiteName : undefined}
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSiteName}
          disabled={disabled}
          keepRendered
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <Typography.Text type="secondary">
              {t("settings:SETTINGS_I18N_ENABLE_LABEL")}
            </Typography.Text>
            <Form.Item<GeneralSettingsFormValues>
              name="siteNameI18nEnabled"
              noStyle
              valuePropName="checked"
            >
              <Switch
                checked={Boolean(siteNameI18nEnabled)}
                onChange={(checked) => {
                  form.setFieldValue("siteNameI18nEnabled", Boolean(checked));
                  if (checked) {
                    const def =
                      String(form.getFieldValue("defaultLocale") || "").trim() || defaultLocale;
                    const currentMap =
                      (form.getFieldValue("siteNameI18n") as Record<string, string> | undefined) ??
                      {};
                    const normalized = normalizeLocalizedStringMapForSave(currentMap);
                    if (!Object.keys(normalized).length) {
                      form.setFieldValue("siteNameI18n", { [def]: siteName });
                    }
                  } else {
                    form.setFieldValue("siteNameI18n", {});
                  }
                }}
              />
            </Form.Item>
          </div>

          {siteNameI18nEnabled ? (
            <Form.Item<GeneralSettingsFormValues>
              name="siteNameI18n"
              style={{ marginBottom: 0 }}
              valuePropName="value"
              trigger="onChange"
              getValueFromEvent={(next) => next}
              rules={[
                {
                  validator: async (_rule, value: unknown) => {
                    const def =
                      String(form.getFieldValue("defaultLocale") || "").trim() || defaultLocale;
                    const map = normalizeLocalizedStringMapForSave(
                      (value || {}) as Record<string, string>,
                    );
                    const resolved = resolveDefaultLocaleValue(map, def);
                    if (!resolved)
                      throw new Error(t("settings:SETTINGS_I18N_VALIDATION_DEFAULT_REQUIRED"));
                  },
                },
              ]}
            >
              <LocalizedStringDictField
                supportedLocales={supportedLocales?.length ? supportedLocales : [defaultLocale]}
                defaultLocale={defaultLocale}
                onDefaultLocaleChange={(loc) => form.setFieldValue("defaultLocale", String(loc))}
                placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")}
              />
            </Form.Item>
          ) : (
            <Form.Item<GeneralSettingsFormValues>
              name="siteName"
              rules={[{ required: true, message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED") }]}
              style={{ marginBottom: 0 }}
            >
              <Input size="large" placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")} />
            </Form.Item>
          )}
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteSubtitle"
          title={t("settings:SETTINGS_SITE_SUBTITLE_LABEL")}
          description={t("settings:SETTINGS_SITE_SUBTITLE_DESC")}
          showSummary
          summary={formatSummaryText(siteSubtitle)}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSiteSubtitle}
          confirmLoading={savingKey === "siteSubtitle"}
          onReset={isSiteSubtitleDirty || isResettingSiteSubtitle ? resetSiteSubtitle : undefined}
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSiteSubtitle}
          disabled={disabled}
        >
          <Form.Item<GeneralSettingsFormValues>
            name="siteSubtitle"
            rules={[{ max: 200, message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX") }]}
            style={{ marginBottom: 0 }}
          >
            <Input
              size="large"
              placeholder={t("settings:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
              allowClear
            />
          </Form.Item>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteDescription"
          title={t("settings:SETTINGS_SITE_DESCRIPTION_LABEL")}
          description={t("settings:SETTINGS_SITE_DESCRIPTION_DESC")}
          showSummary
          summary={formatSummaryText(effectiveSiteDescription)}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSiteDescription}
          confirmLoading={savingKey === "siteDescription"}
          onReset={
            isSiteDescriptionDirty || isResettingSiteDescription ? resetSiteDescription : undefined
          }
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSiteDescription}
          disabled={disabled}
          keepRendered
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <Typography.Text type="secondary">
              {t("settings:SETTINGS_I18N_ENABLE_LABEL")}
            </Typography.Text>
            <Form.Item<GeneralSettingsFormValues>
              name="siteDescriptionI18nEnabled"
              noStyle
              valuePropName="checked"
            >
              <Switch
                checked={Boolean(siteDescriptionI18nEnabled)}
                onChange={(checked) => {
                  form.setFieldValue("siteDescriptionI18nEnabled", Boolean(checked));
                  if (checked) {
                    const def =
                      String(form.getFieldValue("defaultLocale") || "").trim() || defaultLocale;
                    const currentMap =
                      (form.getFieldValue("siteDescriptionI18n") as
                        | Record<string, string>
                        | undefined) ?? {};
                    const normalized = normalizeLocalizedStringMapForSave(currentMap);
                    if (!Object.keys(normalized).length) {
                      form.setFieldValue("siteDescriptionI18n", {
                        [def]: siteDescription,
                      });
                    }
                  } else {
                    form.setFieldValue("siteDescriptionI18n", {});
                  }
                }}
              />
            </Form.Item>
          </div>

          {siteDescriptionI18nEnabled ? (
            <Form.Item<GeneralSettingsFormValues>
              name="siteDescriptionI18n"
              style={{ marginBottom: 0 }}
              valuePropName="value"
              trigger="onChange"
              getValueFromEvent={(next) => next}
            >
              <LocalizedStringDictField
                supportedLocales={supportedLocales?.length ? supportedLocales : [defaultLocale]}
                defaultLocale={defaultLocale}
                onDefaultLocaleChange={(loc) => form.setFieldValue("defaultLocale", String(loc))}
                placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
                multiline
              />
            </Form.Item>
          ) : (
            <Form.Item<GeneralSettingsFormValues>
              name="siteDescription"
              rules={[{ max: 200, message: t("setup:SETUP_VALIDATION_SITE_DESC_MAX") }]}
              style={{ marginBottom: 0 }}
            >
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 6 }}
                placeholder={t("settings:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
                allowClear
                maxLength={160}
                showCount={{ formatter: ({ count }) => `${count}/200` }}
              />
            </Form.Item>
          )}
        </SettingAccordionItem>

        <SettingAccordionItem
          value="seoTitlePolicyV1"
          title={t("settings:SETTINGS_SEO_TITLE_FORMAT_TITLE")}
          description={t("settings:SETTINGS_SEO_TITLE_FORMAT_DESC")}
          showSummary
          summary={formatTitlePolicySummary(seoTitlePolicyV1)}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSeoTitlePolicyV1}
          confirmLoading={savingKey === "seoTitlePolicyV1"}
          onReset={
            isSeoTitlePolicyDirty || isResettingSeoTitlePolicyV1 ? resetSeoTitlePolicyV1 : undefined
          }
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSeoTitlePolicyV1}
          disabled={disabled}
          keepRendered
        >
          <Form.Item<GeneralSettingsFormValues>
            name="seoTitlePolicyV1"
            style={{ marginBottom: 0 }}
            valuePropName="value"
            trigger="onChange"
            getValueFromEvent={(next) => next}
            rules={[
              {
                validator: async (_rule, value: unknown) => {
                  normalizeTitlePolicyV1ForSave(
                    value as GeneralSettingsFormValues["seoTitlePolicyV1"],
                    t,
                  );
                },
              },
            ]}
          >
            <SeoTitlePolicyField siteName={effectiveSiteName} siteSubtitle={siteSubtitle} />
          </Form.Item>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteUrl"
          title={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
          description={t("settings:SETTINGS_SITE_URL_DESC")}
          showSummary
          summary={formatSummaryText(siteUrl)}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSiteUrl}
          confirmLoading={savingKey === "siteUrl"}
          onReset={isSiteUrlDirty || isResettingSiteUrl ? resetSiteUrl : undefined}
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSiteUrl}
          disabled={disabled}
        >
          <Form.Item<GeneralSettingsFormValues>
            name="siteUrl"
            rules={[
              { required: true, message: t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED") },
              {
                validator: async (_rule, value: string | undefined) => {
                  const raw = (value || "").trim();
                  if (!raw) return;
                  try {
                    const url = new URL(raw);
                    if (url.protocol !== "http:" && url.protocol !== "https:") {
                      throw new Error("invalid protocol");
                    }
                  } catch {
                    throw new Error(t("setup:SETUP_VALIDATION_SITE_URL_INVALID"));
                  }
                },
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <Input size="large" placeholder={t("setup:SETUP_FIELD_SITE_URL_PLACEHOLDER")} />
          </Form.Item>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteLogoUrl"
          title={t("settings:SETTINGS_SITE_LOGO_LABEL")}
          description={t("settings:SETTINGS_SITE_LOGO_DESC")}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSiteLogoUrl}
          confirmLoading={savingKey === "siteLogoUrl"}
          onReset={isSiteLogoUrlDirty || isResettingSiteLogoUrl ? resetSiteLogoUrl : undefined}
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSiteLogoUrl}
          disabled={disabled}
          keepRendered
        >
          <SiteSettingsAssetField
            form={form}
            assetFieldName="siteLogoAssetId"
            urlFieldName="siteLogoUrl"
            previewUrl={siteLogoPreviewUrl}
            assetId={siteLogoAssetId}
            url={siteLogoUrl}
            pickerOpen={logoPickerOpen}
            onPickerOpenChange={setLogoPickerOpen}
            uploadPurpose="site_logo"
            pickerTitle={t("settings:SETTINGS_SITE_LOGO_PICKER_TITLE")}
            pickerDescription={t("settings:SETTINGS_SITE_LOGO_PICKER_DESC")}
            inputPlaceholder={t("settings:SETTINGS_SITE_LOGO_PLACEHOLDER")}
          />
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteFaviconUrl"
          title={t("settings:SETTINGS_SITE_FAVICON_LABEL")}
          description={t("settings:SETTINGS_SITE_FAVICON_DESC")}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSiteFaviconUrl}
          confirmLoading={savingKey === "siteFaviconUrl"}
          onReset={
            isSiteFaviconUrlDirty || isResettingSiteFaviconUrl ? resetSiteFaviconUrl : undefined
          }
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSiteFaviconUrl}
          disabled={disabled}
          keepRendered
        >
          <SiteSettingsAssetField
            form={form}
            assetFieldName="siteFaviconAssetId"
            urlFieldName="siteFaviconUrl"
            previewUrl={siteFaviconPreviewUrl}
            assetId={siteFaviconAssetId}
            url={siteFaviconUrl}
            pickerOpen={faviconPickerOpen}
            onPickerOpenChange={setFaviconPickerOpen}
            uploadPurpose="favicon"
            pickerTitle={t("settings:SETTINGS_SITE_FAVICON_PICKER_TITLE")}
            pickerDescription={t("settings:SETTINGS_SITE_FAVICON_PICKER_DESC")}
            inputPlaceholder={t("settings:SETTINGS_SITE_FAVICON_PLACEHOLDER")}
          />
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteContactEmail"
          title={t("settings:SETTINGS_SITE_CONTACT_EMAIL_LABEL")}
          description={t("settings:SETTINGS_SITE_CONTACT_EMAIL_DESC")}
          showSummary
          summary={formatSummaryText(siteContactEmail)}
          confirmText={t("settings:SETTINGS_SAVE")}
          onConfirm={saveSiteContactEmail}
          confirmLoading={savingKey === "siteContactEmail"}
          onReset={
            isSiteContactEmailDirty || isResettingSiteContactEmail
              ? resetSiteContactEmail
              : undefined
          }
          resetText={t("settings:SETTINGS_RESET")}
          resetLoading={isResettingSiteContactEmail}
          disabled={disabled}
        >
          <Form.Item<GeneralSettingsFormValues>
            name="siteContactEmail"
            rules={[
              {
                validator: async (_rule, value: string | undefined) => {
                  const raw = (value || "").trim();
                  if (!raw) return;
                  // Optional 字段做最小 email 校验即可。
                  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
                  if (ok) return;
                  throw new Error(t("settings:SETTINGS_VALIDATION_EMAIL_INVALID"));
                },
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <Input
              size="large"
              placeholder={t("settings:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
              allowClear
            />
          </Form.Item>
        </SettingAccordionItem>
      </Accordion>
    </>
  );
}

function toApiTitlePolicyV1(
  input: GeneralSettingsFormValues["seoTitlePolicyV1"],
): Record<string, unknown> {
  const homeMode = input.homeMode ?? "siteOnly";
  return {
    parts: input.parts,
    home_mode: homeMode,
    dedupe: input.dedupe !== false,
  };
}

function normalizeTitlePolicyV1ForSave(
  input: GeneralSettingsFormValues["seoTitlePolicyV1"],
  t: (key: string, options?: Record<string, unknown>) => string,
): GeneralSettingsFormValues["seoTitlePolicyV1"] {
  const raw = input as unknown as {
    parts?: unknown;
    homeMode?: unknown;
    home_mode?: unknown;
    dedupe?: unknown;
  };

  const partsUnknown = raw?.parts;
  if (!Array.isArray(partsUnknown)) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID"));
  }
  if (partsUnknown.length === 0) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_EMPTY"));
  }
  if (partsUnknown.length > 32) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_TOO_MANY_PARTS", { max: 32 }));
  }

  const allowedTokens = new Set(["pageTitle", "siteName", "siteSubtitle"]);
  const parts: Array<
    | { kind: "token"; value: "pageTitle" | "siteName" | "siteSubtitle" }
    | { kind: "literal"; value: string }
  > = [];

  for (const p of partsUnknown) {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_PART"));
    }
    const pr = p as Record<string, unknown>;
    const kind = typeof pr.kind === "string" ? pr.kind.trim() : "";
    const valueRaw = pr.value;

    if (kind === "token") {
      const token = typeof valueRaw === "string" ? valueRaw.trim() : String(valueRaw ?? "").trim();
      if (!allowedTokens.has(token)) {
        throw new Error(
          t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_TOKEN", { token }),
        );
      }
      parts.push({ kind: "token", value: token as "pageTitle" | "siteName" | "siteSubtitle" });
      continue;
    }

    if (kind === "literal") {
      const literal = typeof valueRaw === "string" ? valueRaw : String(valueRaw ?? "");
      if (literal.length > 64) {
        throw new Error(
          t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_LITERAL_TOO_LONG", {
            max: 64,
          }),
        );
      }
      parts.push({ kind: "literal", value: literal });
      continue;
    }

    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_PART"));
  }

  const hasAnyToken = parts.some((p) => p.kind === "token");
  if (!hasAnyToken) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_REQUIRE_TOKEN"));
  }

  const homeModeRaw = (
    typeof raw.homeMode === "string"
      ? raw.homeMode
      : typeof raw.home_mode === "string"
        ? raw.home_mode
        : ""
  ).trim();
  const homeMode =
    homeModeRaw === "policy" || homeModeRaw === "siteOnly" ? homeModeRaw : "siteOnly";

  const dedupe = typeof raw.dedupe === "boolean" ? raw.dedupe : true;

  return {
    parts,
    homeMode,
    dedupe,
  };
}

function formatTitlePolicySummary(input: GeneralSettingsFormValues["seoTitlePolicyV1"]): string {
  const parts = input.parts ?? [];
  if (!parts.length) return "-";
  const tokens = parts
    .map((p) => (p.kind === "token" ? p.value : null))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const literalCount = parts.filter((p) => p.kind === "literal").length;
  return `${tokens.join(" + ")}${literalCount ? ` (${literalCount} literals)` : ""}`;
}

function normalizeLocalizedStringMapForSave(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Object.entries(input || {});
  for (const [k, v] of entries) {
    const key = String(k || "").trim();
    const val = String(v || "").trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

function resolveDefaultLocaleValue(map: Record<string, string>, defaultLocale: string): string {
  const def = (defaultLocale || "").trim();
  if (def && typeof map?.[def] === "string" && map[def]!.trim()) return map[def]!.trim();
  const first = Object.values(map || {}).find((x) => typeof x === "string" && x.trim());
  return (first || "").trim();
}
