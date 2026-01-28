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
  siteUrl: string;
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
    const siteUrl = pickString(v, ["site", "url"]) ?? "";

    const locale = (pickString(v, ["localization", "locale"]) as AppLocale | undefined) ?? "zh-CN";
    const timezone = pickString(v, ["localization", "timezone"]) ?? "Asia/Shanghai";
    const dateFormat = pickString(v, ["localization", "date_format"]) ?? "YYYY-MM-DD";

    return { siteName, siteUrl, locale, timezone, dateFormat };
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
  const siteUrl = (Form.useWatch("siteUrl", form) as string | undefined) ?? initialValues.siteUrl;
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
  const isSiteUrlDirty = (siteUrl || "") !== (initialValues.siteUrl || "");
  const isLocaleDirty = (locale || "") !== (initialValues.locale || "");
  const isTimezoneDirty = (timezone || "") !== (initialValues.timezone || "");
  const isDateFormatDirty = (dateFormat || "") !== (initialValues.dateFormat || "");

  const isResettingSiteName = savingKey === "reset:siteName";
  const isResettingSiteUrl = savingKey === "reset:siteUrl";
  const isResettingLocale = savingKey === "reset:locale";
  const isResettingTimezone = savingKey === "reset:timezone";
  const isResettingDateFormat = savingKey === "reset:dateFormat";

  const resetSiteName = async () => {
    setSavingKey("reset:siteName");
    form.setFieldValue("siteName", initialValues.siteName);
    await saveMutation.mutateAsync({ site: { name: initialValues.siteName } });
  };

  const resetSiteUrl = async () => {
    setSavingKey("reset:siteUrl");
    form.setFieldValue("siteUrl", initialValues.siteUrl);
    await saveMutation.mutateAsync({ site: { url: initialValues.siteUrl } });
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

  const saveSiteUrl = async () => {
    setSavingKey("siteUrl");
    const values = await form.validateFields(["siteUrl"]);
    await saveMutation.mutateAsync({ site: { url: String(values.siteUrl).trim() } });
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
                  summary={siteName || "-"}
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
                  value="siteUrl"
                  title={t("common:SETUP_FIELD_SITE_URL_LABEL")}
                  description={t("common:SETTINGS_SITE_URL_DESC")}
                  showSummary
                  summary={siteUrl || "-"}
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
