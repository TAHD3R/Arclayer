import { Form, Select } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";

import { Accordion } from "@/components/ui/accordion";
import { SettingAccordionItem } from "@/components/common/setting-accordion-item";
import type { AppLocale } from "@/lib/i18n";

import {
  buildDateFormatOptions,
  buildLocaleOptions,
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

  const locale =
    (useLocalizationField(form, "locale") as AppLocale | undefined) ?? initialValues.locale;
  const timezone =
    (useLocalizationField(form, "timezone") as string | undefined) ?? initialValues.timezone;
  const dateFormat =
    (useLocalizationField(form, "dateFormat") as string | undefined) ?? initialValues.dateFormat;

  const localeOptions = buildLocaleOptions(t);
  const timezoneOptions = buildTimezoneOptions(timezone);
  const dateFormatOptions = buildDateFormatOptions();

  const localeLabel = localeOptions.find((item) => item.value === locale)?.label ?? locale;
  const dateFormatLabel = resolveDateFormatLabel(dateFormat);

  const isLocaleDirty = (locale || "") !== (initialValues.locale || "");
  const isTimezoneDirty = (timezone || "") !== (initialValues.timezone || "");
  const isDateFormatDirty = (dateFormat || "") !== (initialValues.dateFormat || "");

  const isResettingLocale = savingKey === "reset:locale";
  const isResettingTimezone = savingKey === "reset:timezone";
  const isResettingDateFormat = savingKey === "reset:dateFormat";

  const resetLocale = () =>
    withSavingKey("reset:locale", async () => {
      form.setFieldValue("locale", initialValues.locale);
      await patch({ site_localization: { locale: initialValues.locale } });
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

  const saveLocale = () =>
    withSavingKey("locale", async () => {
      const values = await form.validateFields(["locale"]);
      await patch({ site_localization: { locale: values.locale } });
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
        value="locale"
        title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
        description={t("settings:SETTINGS_SITE_LANGUAGE_DESC")}
        showSummary
        summary={localeLabel}
        confirmText={t("settings:SETTINGS_SAVE")}
        onConfirm={saveLocale}
        confirmLoading={savingKey === "locale"}
        onReset={isLocaleDirty || isResettingLocale ? resetLocale : undefined}
        resetLoading={isResettingLocale}
        disabled={disabled}
      >
        <Form.Item<GeneralSettingsFormValues>
          name="locale"
          rules={[{ required: true, message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }]}
          style={{ marginBottom: 0 }}
        >
          <Select size="large" options={localeOptions} />
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
