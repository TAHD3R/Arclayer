import { Alert, Button, Form, Input, Select, Spin } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/app/defaultPage";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { Accordion } from "@/components/animate-ui/components/radix/accordion";
import { SettingAccordionItem } from "@/components/app/settingAccordionItem";
import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { type AppLocale } from "@/utils/i18n";

type GeneralSettingsFormValues = {
  siteName: string;
  siteSubtitle: string;
  siteDescription: string;
  siteUrl: string;
  siteLogoUrl: string;
  siteFaviconUrl: string;
  siteContactEmail: string;
  locale: AppLocale;
  timezone: string;
  dateFormat: string;
};

const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
] as const;

const DATE_FORMAT_ITEMS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-01-28)" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD (2026/01/28)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (01/28/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (28/01/2026)" },
] as const;

function normalizeOptionalString(value: string | undefined): string | null {
  const raw = (value || "").trim();
  return raw ? raw : null;
}

function isValidHttpUrlOrAbsolutePath(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw) return true;
  if (raw.startsWith("/")) return true;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatSummaryText(value: string | undefined, maxLen = 48): string {
  const raw = (value || "").trim();
  if (!raw) return "-";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}...`;
}

function pickString(obj: unknown, path: readonly string[]): string | undefined {
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return typeof cur === "string" ? cur : undefined;
}

function formatLocaleLabel(locale: AppLocale, t: (key: string) => string): string {
  return locale === "zh-CN" ? t("common:ACCOUNT_LANGUAGE_ZH") : t("common:ACCOUNT_LANGUAGE_EN");
}

export function GeneralSettingsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<GeneralSettingsFormValues>();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const coreQuery = useQuery({
    queryKey: ["settings", "core"],
    queryFn: async () => getCoreSettings(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const initialValues = useMemo<GeneralSettingsFormValues>(() => {
    const v = coreQuery.data?.value;

    const siteName = pickString(v, ["site", "name"]) ?? "Celestial CMS";
    const siteSubtitle = pickString(v, ["site", "subtitle"]) ?? "";
    const siteDescription = pickString(v, ["seo", "default_description"]) ?? "";
    const siteUrl = pickString(v, ["site", "url"]) ?? "";
    const siteLogoUrl = pickString(v, ["site", "logo_url"]) ?? "";
    const siteFaviconUrl = pickString(v, ["site", "favicon_url"]) ?? "";
    const siteContactEmail = pickString(v, ["site", "contact_email"]) ?? "";

    const locale = (pickString(v, ["localization", "locale"]) as AppLocale | undefined) ?? "zh-CN";
    const timezone = pickString(v, ["localization", "timezone"]) ?? "Asia/Shanghai";
    const dateFormat = pickString(v, ["localization", "date_format"]) ?? "YYYY-MM-DD";

    return {
      siteName,
      siteSubtitle,
      siteDescription,
      siteUrl,
      siteLogoUrl,
      siteFaviconUrl,
      siteContactEmail,
      locale,
      timezone,
      dateFormat,
    };
  }, [coreQuery.data?.value]);

  useEffect(() => {
    if (!coreQuery.data) return;
    form.setFieldsValue(initialValues);
  }, [coreQuery.data, form, initialValues]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchCoreSettings(patch),
    onSuccess: async () => {
      notifySuccessText(t("common:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "core"] });
    },
    onError: (err) => notifyError(err),
    onSettled: () => setSavingKey(null),
  });

  // useWatch may not emit until the field is mounted (e.g. accordion content is collapsed).
  // Fallback to the latest loaded core settings so summary can still render without expanding.
  const siteName =
    (Form.useWatch("siteName", form) as string | undefined) ?? initialValues.siteName;
  const siteSubtitle =
    (Form.useWatch("siteSubtitle", form) as string | undefined) ?? initialValues.siteSubtitle;
  const siteDescription =
    (Form.useWatch("siteDescription", form) as string | undefined) ?? initialValues.siteDescription;
  const siteUrl = (Form.useWatch("siteUrl", form) as string | undefined) ?? initialValues.siteUrl;
  const siteLogoUrl =
    (Form.useWatch("siteLogoUrl", form) as string | undefined) ?? initialValues.siteLogoUrl;
  const siteFaviconUrl =
    (Form.useWatch("siteFaviconUrl", form) as string | undefined) ?? initialValues.siteFaviconUrl;
  const siteContactEmail =
    (Form.useWatch("siteContactEmail", form) as string | undefined) ??
    initialValues.siteContactEmail;
  const locale = (Form.useWatch("locale", form) as AppLocale | undefined) ?? initialValues.locale;
  const timezone =
    (Form.useWatch("timezone", form) as string | undefined) ?? initialValues.timezone;
  const dateFormat =
    (Form.useWatch("dateFormat", form) as string | undefined) ?? initialValues.dateFormat;

  const localeLabel = locale ? formatLocaleLabel(locale, t) : undefined;
  const dateFormatLabel =
    DATE_FORMAT_ITEMS.find((it) => it.value === dateFormat)?.label ?? dateFormat;

  const disabled = coreQuery.isFetching || saveMutation.isPending;

  const isSiteNameDirty = (siteName || "") !== (initialValues.siteName || "");
  const isSiteSubtitleDirty = (siteSubtitle || "") !== (initialValues.siteSubtitle || "");
  const isSiteDescriptionDirty = (siteDescription || "") !== (initialValues.siteDescription || "");
  const isSiteUrlDirty = (siteUrl || "") !== (initialValues.siteUrl || "");
  const isSiteLogoUrlDirty = (siteLogoUrl || "") !== (initialValues.siteLogoUrl || "");
  const isSiteFaviconUrlDirty = (siteFaviconUrl || "") !== (initialValues.siteFaviconUrl || "");
  const isSiteContactEmailDirty =
    (siteContactEmail || "") !== (initialValues.siteContactEmail || "");
  const isLocaleDirty = (locale || "") !== (initialValues.locale || "");
  const isTimezoneDirty = (timezone || "") !== (initialValues.timezone || "");
  const isDateFormatDirty = (dateFormat || "") !== (initialValues.dateFormat || "");

  const isResettingSiteName = savingKey === "reset:siteName";
  const isResettingSiteSubtitle = savingKey === "reset:siteSubtitle";
  const isResettingSiteDescription = savingKey === "reset:siteDescription";
  const isResettingSiteUrl = savingKey === "reset:siteUrl";
  const isResettingSiteLogoUrl = savingKey === "reset:siteLogoUrl";
  const isResettingSiteFaviconUrl = savingKey === "reset:siteFaviconUrl";
  const isResettingSiteContactEmail = savingKey === "reset:siteContactEmail";
  const isResettingLocale = savingKey === "reset:locale";
  const isResettingTimezone = savingKey === "reset:timezone";
  const isResettingDateFormat = savingKey === "reset:dateFormat";

  const resetSiteName = async () => {
    setSavingKey("reset:siteName");
    form.setFieldValue("siteName", initialValues.siteName);
    await saveMutation.mutateAsync({ site: { name: initialValues.siteName } });
  };

  const resetSiteSubtitle = async () => {
    setSavingKey("reset:siteSubtitle");
    form.setFieldValue("siteSubtitle", initialValues.siteSubtitle);
    await saveMutation.mutateAsync({
      site: { subtitle: normalizeOptionalString(initialValues.siteSubtitle) },
    });
  };

  const resetSiteDescription = async () => {
    setSavingKey("reset:siteDescription");
    form.setFieldValue("siteDescription", initialValues.siteDescription);
    await saveMutation.mutateAsync({
      seo: { default_description: normalizeOptionalString(initialValues.siteDescription) },
    });
  };

  const resetSiteUrl = async () => {
    setSavingKey("reset:siteUrl");
    form.setFieldValue("siteUrl", initialValues.siteUrl);
    await saveMutation.mutateAsync({ site: { url: initialValues.siteUrl } });
  };

  const resetSiteLogoUrl = async () => {
    setSavingKey("reset:siteLogoUrl");
    form.setFieldValue("siteLogoUrl", initialValues.siteLogoUrl);
    await saveMutation.mutateAsync({
      site: { logo_url: normalizeOptionalString(initialValues.siteLogoUrl) },
    });
  };

  const resetSiteFaviconUrl = async () => {
    setSavingKey("reset:siteFaviconUrl");
    form.setFieldValue("siteFaviconUrl", initialValues.siteFaviconUrl);
    await saveMutation.mutateAsync({
      site: { favicon_url: normalizeOptionalString(initialValues.siteFaviconUrl) },
    });
  };

  const resetSiteContactEmail = async () => {
    setSavingKey("reset:siteContactEmail");
    form.setFieldValue("siteContactEmail", initialValues.siteContactEmail);
    await saveMutation.mutateAsync({
      site: { contact_email: normalizeOptionalString(initialValues.siteContactEmail) },
    });
  };

  const resetLocale = async () => {
    setSavingKey("reset:locale");
    form.setFieldValue("locale", initialValues.locale);
    await saveMutation.mutateAsync({ localization: { locale: initialValues.locale } });
  };

  const resetTimezone = async () => {
    setSavingKey("reset:timezone");
    form.setFieldValue("timezone", initialValues.timezone);
    await saveMutation.mutateAsync({ localization: { timezone: initialValues.timezone } });
  };

  const resetDateFormat = async () => {
    setSavingKey("reset:dateFormat");
    form.setFieldValue("dateFormat", initialValues.dateFormat);
    await saveMutation.mutateAsync({ localization: { date_format: initialValues.dateFormat } });
  };

  const saveSiteName = async () => {
    setSavingKey("siteName");
    const values = await form.validateFields(["siteName"]);
    await saveMutation.mutateAsync({ site: { name: String(values.siteName).trim() } });
  };

  const saveSiteSubtitle = async () => {
    setSavingKey("siteSubtitle");
    const values = await form.validateFields(["siteSubtitle"]);
    await saveMutation.mutateAsync({
      site: { subtitle: normalizeOptionalString(values.siteSubtitle) },
    });
  };

  const saveSiteDescription = async () => {
    setSavingKey("siteDescription");
    const values = await form.validateFields(["siteDescription"]);
    await saveMutation.mutateAsync({
      seo: { default_description: normalizeOptionalString(values.siteDescription) },
    });
  };

  const saveSiteUrl = async () => {
    setSavingKey("siteUrl");
    const values = await form.validateFields(["siteUrl"]);
    await saveMutation.mutateAsync({ site: { url: String(values.siteUrl).trim() } });
  };

  const saveSiteLogoUrl = async () => {
    setSavingKey("siteLogoUrl");
    const values = await form.validateFields(["siteLogoUrl"]);
    await saveMutation.mutateAsync({
      site: { logo_url: normalizeOptionalString(values.siteLogoUrl) },
    });
  };

  const saveSiteFaviconUrl = async () => {
    setSavingKey("siteFaviconUrl");
    const values = await form.validateFields(["siteFaviconUrl"]);
    await saveMutation.mutateAsync({
      site: { favicon_url: normalizeOptionalString(values.siteFaviconUrl) },
    });
  };

  const saveSiteContactEmail = async () => {
    setSavingKey("siteContactEmail");
    const values = await form.validateFields(["siteContactEmail"]);
    await saveMutation.mutateAsync({
      site: { contact_email: normalizeOptionalString(values.siteContactEmail) },
    });
  };

  const saveLocale = async () => {
    setSavingKey("locale");
    const values = await form.validateFields(["locale"]);
    await saveMutation.mutateAsync({ localization: { locale: values.locale } });
  };

  const saveTimezone = async () => {
    setSavingKey("timezone");
    const values = await form.validateFields(["timezone"]);
    await saveMutation.mutateAsync({ localization: { timezone: String(values.timezone) } });
  };

  const saveDateFormat = async () => {
    setSavingKey("dateFormat");
    const values = await form.validateFields(["dateFormat"]);
    await saveMutation.mutateAsync({ localization: { date_format: String(values.dateFormat) } });
  };

  return (
    <DefaultPage
      title={t("common:SETTINGS_GENERAL_TITLE")}
      description={t("common:SETTINGS_GENERAL_DESC")}
      width="fixed"
    >
      {coreQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <Spin />
        </div>
      ) : coreQuery.isError || !coreQuery.data ? (
        <Alert
          type="error"
          showIcon
          message={t("common:REQUEST_FAILED")}
          description={t("common:SETTINGS_LOAD_FAILED_DESC")}
          action={
            <Button size="small" onClick={() => void coreQuery.refetch()}>
              {t("common:REFRESH")}
            </Button>
          }
        />
      ) : (
        <Form<GeneralSettingsFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={disabled}
          initialValues={initialValues}
        >
          <ChromeTabs defaultValue="site">
            <ChromeTabsList>
              <ChromeTabsTrigger value="site">
                {t("common:SETTINGS_GENERAL_TAB_SITE")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="localization">
                {t("common:SETTINGS_GENERAL_TAB_LOCALIZATION")}
              </ChromeTabsTrigger>
            </ChromeTabsList>

            <ChromeTabsContent value="site">
              <Accordion type="single" collapsible className="px-0">
                <SettingAccordionItem
                  value="siteName"
                  title={t("common:SETUP_FIELD_SITE_NAME_LABEL")}
                  description={t("common:SETTINGS_SITE_NAME_DESC")}
                  showSummary
                  summary={formatSummaryText(siteName)}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveSiteName}
                  confirmLoading={savingKey === "siteName"}
                  onReset={isSiteNameDirty || isResettingSiteName ? resetSiteName : undefined}
                  resetLoading={isResettingSiteName}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteName"
                    rules={[
                      { required: true, message: t("common:SETUP_VALIDATION_SITE_NAME_REQUIRED") },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("common:SETUP_FIELD_SITE_NAME_PLACEHOLDER")}
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteSubtitle"
                  title={t("common:SETTINGS_SITE_SUBTITLE_LABEL")}
                  description={t("common:SETTINGS_SITE_SUBTITLE_DESC")}
                  showSummary
                  summary={formatSummaryText(siteSubtitle)}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveSiteSubtitle}
                  confirmLoading={savingKey === "siteSubtitle"}
                  onReset={
                    isSiteSubtitleDirty || isResettingSiteSubtitle ? resetSiteSubtitle : undefined
                  }
                  resetLoading={isResettingSiteSubtitle}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteSubtitle"
                    rules={[{ max: 200, message: t("common:SETUP_VALIDATION_SITE_DESC_MAX") }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("common:SETTINGS_SITE_SUBTITLE_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteDescription"
                  title={t("common:SETTINGS_SITE_DESCRIPTION_LABEL")}
                  description={t("common:SETTINGS_SITE_DESCRIPTION_DESC")}
                  showSummary
                  summary={formatSummaryText(siteDescription)}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveSiteDescription}
                  confirmLoading={savingKey === "siteDescription"}
                  onReset={
                    isSiteDescriptionDirty || isResettingSiteDescription
                      ? resetSiteDescription
                      : undefined
                  }
                  resetLoading={isResettingSiteDescription}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteDescription"
                    rules={[{ max: 200, message: t("common:SETUP_VALIDATION_SITE_DESC_MAX") }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea
                      autoSize={{ minRows: 3, maxRows: 6 }}
                      placeholder={t("common:SETTINGS_SITE_DESCRIPTION_PLACEHOLDER")}
                      allowClear
                      maxLength={160}
                      showCount={{
                        formatter: ({ count }) => `${count}/200`,
                      }}
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteUrl"
                  title={t("common:SETUP_FIELD_SITE_URL_LABEL")}
                  description={t("common:SETTINGS_SITE_URL_DESC")}
                  showSummary
                  summary={formatSummaryText(siteUrl)}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveSiteUrl}
                  confirmLoading={savingKey === "siteUrl"}
                  onReset={isSiteUrlDirty || isResettingSiteUrl ? resetSiteUrl : undefined}
                  resetLoading={isResettingSiteUrl}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="siteUrl"
                    rules={[
                      { required: true, message: t("common:SETUP_VALIDATION_SITE_URL_REQUIRED") },
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
                            throw new Error(t("common:SETUP_VALIDATION_SITE_URL_INVALID"));
                          }
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("common:SETUP_FIELD_SITE_URL_PLACEHOLDER")}
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteLogoUrl"
                  title={t("common:SETTINGS_SITE_LOGO_LABEL")}
                  description={t("common:SETTINGS_SITE_LOGO_DESC")}
                  showSummary
                  summary={formatSummaryText(siteLogoUrl)}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveSiteLogoUrl}
                  confirmLoading={savingKey === "siteLogoUrl"}
                  onReset={
                    isSiteLogoUrlDirty || isResettingSiteLogoUrl ? resetSiteLogoUrl : undefined
                  }
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
                          throw new Error(t("common:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("common:SETTINGS_SITE_LOGO_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteFaviconUrl"
                  title={t("common:SETTINGS_SITE_FAVICON_LABEL")}
                  description={t("common:SETTINGS_SITE_FAVICON_DESC")}
                  showSummary
                  summary={formatSummaryText(siteFaviconUrl)}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveSiteFaviconUrl}
                  confirmLoading={savingKey === "siteFaviconUrl"}
                  onReset={
                    isSiteFaviconUrlDirty || isResettingSiteFaviconUrl
                      ? resetSiteFaviconUrl
                      : undefined
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
                          throw new Error(t("common:SETTINGS_VALIDATION_URL_OR_PATH_INVALID"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("common:SETTINGS_SITE_FAVICON_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="siteContactEmail"
                  title={t("common:SETTINGS_SITE_CONTACT_EMAIL_LABEL")}
                  description={t("common:SETTINGS_SITE_CONTACT_EMAIL_DESC")}
                  showSummary
                  summary={formatSummaryText(siteContactEmail)}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveSiteContactEmail}
                  confirmLoading={savingKey === "siteContactEmail"}
                  onReset={
                    isSiteContactEmailDirty || isResettingSiteContactEmail
                      ? resetSiteContactEmail
                      : undefined
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
                          // Minimal email validation for optional field.
                          const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
                          if (ok) return;
                          throw new Error(t("common:SETTINGS_VALIDATION_EMAIL_INVALID"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      size="large"
                      placeholder={t("common:SETTINGS_SITE_CONTACT_EMAIL_PLACEHOLDER")}
                      allowClear
                    />
                  </Form.Item>
                </SettingAccordionItem>
              </Accordion>
            </ChromeTabsContent>

            <ChromeTabsContent value="localization">
              <Accordion type="single" collapsible className="px-0">
                <SettingAccordionItem
                  value="locale"
                  title={t("common:SETUP_FIELD_LANGUAGE_TITLE")}
                  description={t("common:SETTINGS_LANGUAGE_DESC")}
                  showSummary
                  summary={localeLabel || "-"}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveLocale}
                  confirmLoading={savingKey === "locale"}
                  onReset={isLocaleDirty || isResettingLocale ? resetLocale : undefined}
                  resetLoading={isResettingLocale}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="locale"
                    rules={[
                      { required: true, message: t("common:SETUP_VALIDATION_LOCALE_REQUIRED") },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      options={[
                        { value: "zh-CN", label: t("common:ACCOUNT_LANGUAGE_ZH") },
                        { value: "en-US", label: t("common:ACCOUNT_LANGUAGE_EN") },
                      ]}
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="timezone"
                  title={t("common:SETUP_FIELD_TIMEZONE_TITLE")}
                  description={t("common:SETTINGS_TIMEZONE_DESC")}
                  showSummary
                  summary={timezone || "-"}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveTimezone}
                  confirmLoading={savingKey === "timezone"}
                  onReset={isTimezoneDirty || isResettingTimezone ? resetTimezone : undefined}
                  resetLoading={isResettingTimezone}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="timezone"
                    rules={[
                      { required: true, message: t("common:SETUP_VALIDATION_TIMEZONE_REQUIRED") },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      options={COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                </SettingAccordionItem>

                <SettingAccordionItem
                  value="dateFormat"
                  title={t("common:SETUP_FIELD_DATE_FORMAT_TITLE")}
                  description={t("common:SETTINGS_DATE_FORMAT_DESC")}
                  showSummary
                  summary={dateFormatLabel || "-"}
                  confirmText={t("common:SETTINGS_SAVE")}
                  onConfirm={saveDateFormat}
                  confirmLoading={savingKey === "dateFormat"}
                  onReset={isDateFormatDirty || isResettingDateFormat ? resetDateFormat : undefined}
                  resetLoading={isResettingDateFormat}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="dateFormat"
                    rules={[
                      {
                        required: true,
                        message: t("common:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      size="large"
                      options={DATE_FORMAT_ITEMS.map((it) => ({
                        value: it.value,
                        label: it.label,
                      }))}
                    />
                  </Form.Item>
                </SettingAccordionItem>
              </Accordion>
            </ChromeTabsContent>
          </ChromeTabs>
        </Form>
      )}
    </DefaultPage>
  );
}
