import { Form, Input, Select } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Accordion } from "@/components/animate-ui/components/radix/accordion";
import { SettingAccordionItem } from "@/components/app/settingAccordionItem";
import { type AppLocale } from "@/utils/i18n";
import { type SetupDefaultsDraft } from "@/stores/useSetupWizardStore";

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

function formatLocaleLabel(locale: AppLocale, t: (key: string) => string): string {
  if (locale === "zh-CN") return t("account:ACCOUNT_LANGUAGE_ZH");
  return t("account:ACCOUNT_LANGUAGE_EN");
}

export function SetupDefaultsStep(props: {
  form: ReturnType<typeof Form.useForm<SetupDefaultsDraft>>[0];
  disabled?: boolean;
  onValuesChange: (
    changed: Partial<SetupDefaultsDraft>,
    values: Partial<SetupDefaultsDraft>,
  ) => void;
}) {
  const { t } = useTranslation();

  const timezone = Form.useWatch("timezone", props.form) as string | undefined;
  const locale = Form.useWatch("locale", props.form) as AppLocale | undefined;
  const dateFormat = Form.useWatch("dateFormat", props.form) as string | undefined;

  const localeItems = useMemo(
    () => [
      { value: "zh-CN" as const, label: formatLocaleLabel("zh-CN", t) },
      { value: "en-US" as const, label: formatLocaleLabel("en-US", t) },
    ],
    [t],
  );

  const timezoneItems = useMemo(() => {
    const base = [...COMMON_TIMEZONES];
    // If the detected/stored timezone isn't in our common list, prepend it so it can be selected.
    if (timezone && !base.includes(timezone as any)) {
      base.unshift(timezone as any);
    }
    return base.map((v) => ({ value: v, label: v }));
  }, [timezone]);

  const currentTimezoneLabel = timezone || timezoneItems[0]?.label || "Asia/Shanghai";
  const currentLocaleLabel = locale ? formatLocaleLabel(locale, t) : localeItems[0]?.label;
  const currentDateFormatLabel =
    DATE_FORMAT_ITEMS.find((it) => it.value === dateFormat)?.label || DATE_FORMAT_ITEMS[0]?.label;

  return (
    <Form<SetupDefaultsDraft>
      form={props.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={props.disabled}
      onValuesChange={props.onValuesChange}
    >
      {/* Hidden items register fields for antd validation. */}
      <Form.Item<SetupDefaultsDraft>
        name="timezone"
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>
      <Form.Item<SetupDefaultsDraft>
        name="locale"
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>
      <Form.Item<SetupDefaultsDraft>
        name="dateFormat"
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>

      <Accordion type="single" collapsible className="px-0">
        <SettingAccordionItem
          value="timezone"
          title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
          description={t("settings:SETTINGS_SITE_TIMEZONE_DESC")}
          showSummary
          summary={currentTimezoneLabel}
          disabled={props.disabled}
        >
          <Select
            size="large"
            className="min-w-[260px]"
            disabled={props.disabled}
            value={timezone}
            options={timezoneItems}
            showSearch
            optionFilterProp="label"
            onChange={(v) => {
              props.form.setFieldValue("timezone", v);
              // `setFieldValue` is programmatic and may not trigger `onValuesChange`,
              // so we explicitly sync it to the wizard store.
              props.onValuesChange({ timezone: v }, props.form.getFieldsValue(true));
            }}
          />
        </SettingAccordionItem>

        <SettingAccordionItem
          value="locale"
          title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
          description={t("settings:SETTINGS_SITE_LANGUAGE_DESC")}
          showSummary
          summary={currentLocaleLabel}
          disabled={props.disabled}
        >
          <Select
            size="large"
            className="min-w-[220px]"
            disabled={props.disabled}
            value={locale}
            options={localeItems}
            onChange={(v) => {
              props.form.setFieldValue("locale", v as AppLocale);
              props.onValuesChange({ locale: v as AppLocale }, props.form.getFieldsValue(true));
            }}
          />
        </SettingAccordionItem>

        <SettingAccordionItem
          value="dateFormat"
          title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
          description={t("settings:SETTINGS_SITE_DATE_FORMAT_DESC")}
          showSummary
          summary={currentDateFormatLabel}
          disabled={props.disabled}
        >
          <Select
            size="large"
            className="min-w-[320px]"
            disabled={props.disabled}
            value={dateFormat}
            options={DATE_FORMAT_ITEMS.map((it) => ({ value: it.value, label: it.label }))}
            onChange={(v) => {
              props.form.setFieldValue("dateFormat", v);
              props.onValuesChange({ dateFormat: v }, props.form.getFieldsValue(true));
            }}
          />
        </SettingAccordionItem>
      </Accordion>
    </Form>
  );
}
