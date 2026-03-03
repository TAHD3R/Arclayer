import { Form, Select } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@/components/settings-primitives/setting-accordion-item";

import {
  buildDateFormatOptions,
  buildTimezoneOptions,
  resolveDateFormatLabel,
} from "@/lib/settings/general/localization-options";
import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import type { GeneralSettingsFormValues } from "@/types/settings-general";

type LocalizationSettingsTabProps = GeneralSettingsTabBaseProps;

function useLocalizationField(
  form: FormInstance<GeneralSettingsFormValues>,
  name: keyof GeneralSettingsFormValues,
) {
  return Form.useWatch(name as string, form) as unknown;
}

export function LocalizationSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
}: LocalizationSettingsTabProps) {
  const { t } = useTranslation();

  const supportedLocales =
    (useLocalizationField(form, "supportedLocales") as string[] | undefined) ??
    initialValues.supportedLocales;
  const defaultLocale =
    (useLocalizationField(form, "defaultLocale") as string | undefined) ??
    initialValues.defaultLocale;
  const fallbackLocale =
    (useLocalizationField(form, "fallbackLocale") as string | undefined) ??
    initialValues.fallbackLocale;
  const timezone =
    (useLocalizationField(form, "timezone") as string | undefined) ?? initialValues.timezone;
  const dateFormat =
    (useLocalizationField(form, "dateFormat") as string | undefined) ?? initialValues.dateFormat;

  const localeOptions = supportedLocales
    .map((loc) => normalizeLocaleTag(loc))
    .filter((x): x is string => Boolean(x))
    .map((value) => ({ value, label: value }));
  const timezoneOptions = buildTimezoneOptions(timezone);
  const dateFormatOptions = buildDateFormatOptions();

  const localeLabel =
    localeOptions.find((item) => item.value === defaultLocale)?.label ?? defaultLocale;
  const dateFormatLabel = resolveDateFormatLabel(dateFormat);

  const isSupportedLocalesDirty =
    JSON.stringify(supportedLocales || []) !== JSON.stringify(initialValues.supportedLocales || []);
  const isDefaultLocaleDirty = (defaultLocale || "") !== (initialValues.defaultLocale || "");
  const isFallbackLocaleDirty = (fallbackLocale || "") !== (initialValues.fallbackLocale || "");
  const isTimezoneDirty = (timezone || "") !== (initialValues.timezone || "");
  const isDateFormatDirty = (dateFormat || "") !== (initialValues.dateFormat || "");

  const isResettingSupportedLocales = savingKey === "reset:supportedLocales";
  const isResettingDefaultLocale = savingKey === "reset:defaultLocale";
  const isResettingFallbackLocale = savingKey === "reset:fallbackLocale";
  const isResettingTimezone = savingKey === "reset:timezone";
  const isResettingDateFormat = savingKey === "reset:dateFormat";

  const resetSupportedLocales = () =>
    withSavingKey("reset:supportedLocales", async () => {
      form.setFieldValue("supportedLocales", initialValues.supportedLocales);
      await patch({ site_localization: { supported_locales: initialValues.supportedLocales } });
    });

  const resetDefaultLocale = () =>
    withSavingKey("reset:defaultLocale", async () => {
      form.setFieldValue("defaultLocale", initialValues.defaultLocale);
      // Backward-compatible: also write legacy `locale`.
      await patch({
        site_localization: {
          default_locale: initialValues.defaultLocale,
          locale: initialValues.defaultLocale,
        },
      });
    });

  const resetFallbackLocale = () =>
    withSavingKey("reset:fallbackLocale", async () => {
      form.setFieldValue("fallbackLocale", initialValues.fallbackLocale);
      await patch({ site_localization: { fallback_locale: initialValues.fallbackLocale } });
    });

  const resetTimezone = () =>
    withSavingKey("reset:timezone", async () => {
      form.setFieldValue("timezone", initialValues.timezone);
      await patch({ site_localization: { timezone: initialValues.timezone } });
    });

  const resetDateFormat = () =>
    withSavingKey("reset:dateFormat", async () => {
      form.setFieldValue("dateFormat", initialValues.dateFormat);
      await patch({ site_localization: { date_format: initialValues.dateFormat } });
    });

  const saveSupportedLocales = () =>
    withSavingKey("supportedLocales", async () => {
      const values = await form.validateFields(["supportedLocales"]);
      const normalized = uniqLocales(values.supportedLocales ?? []);
      const merged = uniqLocales([defaultLocale, fallbackLocale, ...normalized]);
      form.setFieldValue("supportedLocales", merged);
      await patch({ site_localization: { supported_locales: merged } });
    });

  const saveDefaultLocale = () =>
    withSavingKey("defaultLocale", async () => {
      const values = await form.validateFields(["defaultLocale"]);
      const normalized = normalizeLocaleTag(values.defaultLocale) ?? initialValues.defaultLocale;
      form.setFieldValue("defaultLocale", normalized);
      // Backward-compatible: also write legacy `locale`.
      await patch({ site_localization: { default_locale: normalized, locale: normalized } });
    });

  const saveFallbackLocale = () =>
    withSavingKey("fallbackLocale", async () => {
      const values = await form.validateFields(["fallbackLocale"]);
      const normalized = normalizeLocaleTag(values.fallbackLocale) ?? initialValues.fallbackLocale;
      form.setFieldValue("fallbackLocale", normalized);
      await patch({ site_localization: { fallback_locale: normalized } });
    });

  const saveTimezone = () =>
    withSavingKey("timezone", async () => {
      const values = await form.validateFields(["timezone"]);
      await patch({ site_localization: { timezone: String(values.timezone) } });
    });

  const saveDateFormat = () =>
    withSavingKey("dateFormat", async () => {
      const values = await form.validateFields(["dateFormat"]);
      await patch({ site_localization: { date_format: String(values.dateFormat) } });
    });

  return (
    <Accordion type="single" collapsible className="px-0">
      <SettingAccordionItem
        value="supportedLocales"
        title={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_LABEL")}
        description={t("settings:SITE_LOCALIZATION_SUPPORTED_LOCALES_DESC")}
        showSummary
        summary={(supportedLocales || []).join(", ") || "-"}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveSupportedLocales}
        confirmLoading={savingKey === "supportedLocales"}
        onReset={
          isSupportedLocalesDirty || isResettingSupportedLocales ? resetSupportedLocales : undefined
        }
        resetLoading={isResettingSupportedLocales}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="supportedLocales"
          rules={[
            {
              required: true,
              validator: async (_, value: unknown) => {
                if (!Array.isArray(value) || value.length === 0) {
                  throw new Error(t("setup:SETUP_VALIDATION_LOCALE_REQUIRED"));
                }
                const invalid = value
                  .map((x) => (typeof x === "string" ? x.trim() : ""))
                  .filter(Boolean)
                  .find((x) => normalizeLocaleTag(x) === null);
                if (invalid) {
                  throw new Error(
                    t("settings:SITE_LOCALIZATION_INVALID_LOCALE_TAG", { tag: invalid }),
                  );
                }
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Select
            size="large"
            mode="tags"
            tokenSeparators={[",", " "]}
            placeholder="e.g. zh-CN, en-US, fr-FR"
          />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="defaultLocale"
        title={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_LABEL")}
        description={t("settings:SITE_LOCALIZATION_DEFAULT_LOCALE_DESC")}
        showSummary
        summary={localeLabel}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveDefaultLocale}
        confirmLoading={savingKey === "defaultLocale"}
        onReset={isDefaultLocaleDirty || isResettingDefaultLocale ? resetDefaultLocale : undefined}
        resetLoading={isResettingDefaultLocale}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="defaultLocale"
          rules={[{ required: true, message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }]}
          style={{ marginBottom: 0 }}
        >
          <Select size="large" options={localeOptions} showSearch optionFilterProp="label" />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="fallbackLocale"
        title={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_LABEL")}
        description={t("settings:SITE_LOCALIZATION_FALLBACK_LOCALE_DESC")}
        showSummary
        summary={fallbackLocale}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveFallbackLocale}
        confirmLoading={savingKey === "fallbackLocale"}
        onReset={
          isFallbackLocaleDirty || isResettingFallbackLocale ? resetFallbackLocale : undefined
        }
        resetLoading={isResettingFallbackLocale}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="fallbackLocale"
          rules={[{ required: true, message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }]}
          style={{ marginBottom: 0 }}
        >
          <Select size="large" options={localeOptions} showSearch optionFilterProp="label" />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="timezone"
        title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
        description={t("settings:SETTINGS_SITE_TIMEZONE_DESC")}
        showSummary
        summary={timezone}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveTimezone}
        confirmLoading={savingKey === "timezone"}
        onReset={isTimezoneDirty || isResettingTimezone ? resetTimezone : undefined}
        resetLoading={isResettingTimezone}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="timezone"
          rules={[{ required: true, message: t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED") }]}
          style={{ marginBottom: 0 }}
        >
          <Select size="large" options={timezoneOptions} showSearch optionFilterProp="label" />
        </Form.Item>
      </SettingAccordionItem>

      <SettingAccordionItem
        value="dateFormat"
        title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
        description={t("settings:SETTINGS_SITE_DATE_FORMAT_DESC")}
        showSummary
        summary={dateFormatLabel}
        confirmText={t("settings:SETTINGS_SAVE")}
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
              message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Select size="large" options={dateFormatOptions} />
        </Form.Item>
      </SettingAccordionItem>
    </Accordion>
  );
}

function normalizeLocaleTag(input: unknown): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  const looksLikeLocale = /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})*$/.test(raw);
  if (!looksLikeLocale) return null;

  const parts = raw.replaceAll("_", "-").split("-").filter(Boolean);
  if (!parts.length) return null;
  parts[0] = parts[0].toLowerCase();
  if (parts.length >= 2 && parts[1].length === 2) {
    parts[1] = parts[1].toUpperCase();
  }
  return parts.join("-");
}

function uniqLocales(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const norm = normalizeLocaleTag(v);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out;
}
