import { Form, Input } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";

import { Accordion } from "@/components/animate-ui/components/radix/accordion";
import { SettingAccordionItem } from "@/components/app/settingAccordionItem";

import type { GeneralSettingsTabBaseProps } from "../context";
import type { GeneralSettingsFormValues } from "../types";
import { formatSummaryText, isValidHttpUrlOrAbsolutePath, normalizeOptionalString } from "../utils";

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

  // useWatch 在字段未挂载（例如折叠未展开）时可能不触发，这里对齐旧实现：fallback 到初始值。
  const siteName = (useSiteField(form, "siteName") as string | undefined) ?? initialValues.siteName;
  const siteSubtitle =
    (useSiteField(form, "siteSubtitle") as string | undefined) ?? initialValues.siteSubtitle;
  const siteDescription =
    (useSiteField(form, "siteDescription") as string | undefined) ?? initialValues.siteDescription;
  const siteUrl = (useSiteField(form, "siteUrl") as string | undefined) ?? initialValues.siteUrl;
  const siteLogoUrl =
    (useSiteField(form, "siteLogoUrl") as string | undefined) ?? initialValues.siteLogoUrl;
  const siteFaviconUrl =
    (useSiteField(form, "siteFaviconUrl") as string | undefined) ?? initialValues.siteFaviconUrl;
  const siteContactEmail =
    (useSiteField(form, "siteContactEmail") as string | undefined) ??
    initialValues.siteContactEmail;

  const isSiteNameDirty = (siteName || "") !== (initialValues.siteName || "");
  const isSiteSubtitleDirty = (siteSubtitle || "") !== (initialValues.siteSubtitle || "");
  const isSiteDescriptionDirty = (siteDescription || "") !== (initialValues.siteDescription || "");
  const isSiteUrlDirty = (siteUrl || "") !== (initialValues.siteUrl || "");
  const isSiteLogoUrlDirty = (siteLogoUrl || "") !== (initialValues.siteLogoUrl || "");
  const isSiteFaviconUrlDirty = (siteFaviconUrl || "") !== (initialValues.siteFaviconUrl || "");
  const isSiteContactEmailDirty =
    (siteContactEmail || "") !== (initialValues.siteContactEmail || "");

  const isResettingSiteName = savingKey === "reset:siteName";
  const isResettingSiteSubtitle = savingKey === "reset:siteSubtitle";
  const isResettingSiteDescription = savingKey === "reset:siteDescription";
  const isResettingSiteUrl = savingKey === "reset:siteUrl";
  const isResettingSiteLogoUrl = savingKey === "reset:siteLogoUrl";
  const isResettingSiteFaviconUrl = savingKey === "reset:siteFaviconUrl";
  const isResettingSiteContactEmail = savingKey === "reset:siteContactEmail";

  const resetSiteName = () =>
    withSavingKey("reset:siteName", async () => {
      form.setFieldValue("siteName", initialValues.siteName);
      await patch({ site: { name: initialValues.siteName } });
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
      await patch({
        seo: { default_description: normalizeOptionalString(initialValues.siteDescription) },
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
      await patch({
        site: { logo_url: normalizeOptionalString(initialValues.siteLogoUrl) },
      });
    });

  const resetSiteFaviconUrl = () =>
    withSavingKey("reset:siteFaviconUrl", async () => {
      form.setFieldValue("siteFaviconUrl", initialValues.siteFaviconUrl);
      await patch({
        site: { favicon_url: normalizeOptionalString(initialValues.siteFaviconUrl) },
      });
    });

  const resetSiteContactEmail = () =>
    withSavingKey("reset:siteContactEmail", async () => {
      form.setFieldValue("siteContactEmail", initialValues.siteContactEmail);
      await patch({
        site: { contact_email: normalizeOptionalString(initialValues.siteContactEmail) },
      });
    });

  const saveSiteName = () =>
    withSavingKey("siteName", async () => {
      const values = await form.validateFields(["siteName"]);
      await patch({ site: { name: String(values.siteName).trim() } });
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
      const values = await form.validateFields(["siteDescription"]);
      await patch({
        seo: { default_description: normalizeOptionalString(values.siteDescription) },
      });
    });

  const saveSiteUrl = () =>
    withSavingKey("siteUrl", async () => {
      const values = await form.validateFields(["siteUrl"]);
      await patch({ site: { url: String(values.siteUrl).trim() } });
    });

  const saveSiteLogoUrl = () =>
    withSavingKey("siteLogoUrl", async () => {
      const values = await form.validateFields(["siteLogoUrl"]);
      await patch({
        site: { logo_url: normalizeOptionalString(values.siteLogoUrl) },
      });
    });

  const saveSiteFaviconUrl = () =>
    withSavingKey("siteFaviconUrl", async () => {
      const values = await form.validateFields(["siteFaviconUrl"]);
      await patch({
        site: { favicon_url: normalizeOptionalString(values.siteFaviconUrl) },
      });
    });

  const saveSiteContactEmail = () =>
    withSavingKey("siteContactEmail", async () => {
      const values = await form.validateFields(["siteContactEmail"]);
      await patch({
        site: { contact_email: normalizeOptionalString(values.siteContactEmail) },
      });
    });

  return (
    <Accordion type="single" collapsible className="px-0">
      <SettingAccordionItem
        value="siteName"
        title={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
        description={t("settings:SETTINGS_SITE_NAME_DESC")}
        showSummary
        summary={formatSummaryText(siteName)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteName}
        confirmLoading={savingKey === "siteName"}
        onReset={isSiteNameDirty || isResettingSiteName ? resetSiteName : undefined}
        resetLoading={isResettingSiteName}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteName"
          rules={[{ required: true, message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED") }]}
          style={{ marginBottom: 0 }}
        >
          <Input size="large" placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")} />
        </Form.Item>
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
        summary={formatSummaryText(siteDescription)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteDescription}
        confirmLoading={savingKey === "siteDescription"}
        onReset={
          isSiteDescriptionDirty || isResettingSiteDescription ? resetSiteDescription : undefined
        }
        resetLoading={isResettingSiteDescription}
        disabled={disabled}
      >
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
        showSummary
        summary={formatSummaryText(siteLogoUrl)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteLogoUrl}
        confirmLoading={savingKey === "siteLogoUrl"}
        onReset={isSiteLogoUrlDirty || isResettingSiteLogoUrl ? resetSiteLogoUrl : undefined}
        resetLoading={isResettingSiteLogoUrl}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteLogoUrl"
          rules={[
            {
              validator: async (_rule, value: string | undefined) => {
                const raw = (value || "").trim();
                if (!raw) return;
                if (isValidHttpUrlOrAbsolutePath(raw)) return;
                throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_SITE_LOGO_PLACEHOLDER")}
            allowClear
          />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="siteFaviconUrl"
        title={t("settings:SETTINGS_SITE_FAVICON_LABEL")}
        description={t("settings:SETTINGS_SITE_FAVICON_DESC")}
        showSummary
        summary={formatSummaryText(siteFaviconUrl)}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSiteFaviconUrl}
        confirmLoading={savingKey === "siteFaviconUrl"}
        onReset={
          isSiteFaviconUrlDirty || isResettingSiteFaviconUrl ? resetSiteFaviconUrl : undefined
        }
        resetLoading={isResettingSiteFaviconUrl}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="siteFaviconUrl"
          rules={[
            {
              validator: async (_rule, value: string | undefined) => {
                const raw = (value || "").trim();
                if (!raw) return;
                if (isValidHttpUrlOrAbsolutePath(raw)) return;
                throw new Error(t("settings:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_SITE_FAVICON_PLACEHOLDER")}
            allowClear
          />
        </Form.Item>
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
          isSiteContactEmailDirty || isResettingSiteContactEmail ? resetSiteContactEmail : undefined
        }
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
  );
}
