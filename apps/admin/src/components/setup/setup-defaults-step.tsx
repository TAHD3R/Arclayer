import { Form, Select } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SettingAccordionItem } from "@/components/settings-primitives/setting-accordion-item";
import { Accordion } from "@celestial/ui/accordion";
import { DEFAULT_TIMEZONE } from "@/constants/datetime";
import { type AppLocale } from "@/lib/i18n";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
  resolveDateFormatLabel,
} from "@/lib/settings/general/localization-options";
import type { SetupDefaultsDraft } from "@/types/stores";

const SETUP_SELECT_DROPDOWN_Z_INDEX = 2600;

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

  const localeItems = useMemo(() => buildLocaleOptions(t), [t]);
  const timezoneItems = useMemo(() => buildTimezoneOptions(timezone), [timezone]);
  const dateFormatItems = useMemo(() => buildDateFormatOptions(), []);

  const currentTimezoneLabel = timezone || timezoneItems[0]?.label || DEFAULT_TIMEZONE;
  const currentLocaleLabel =
    localeItems.find((item) => item.value === locale)?.label || localeItems[0]?.label;
  const currentDateFormatLabel = resolveDateFormatLabel(dateFormat);

  return (
    <Form<SetupDefaultsDraft>
      form={props.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={props.disabled}
      onValuesChange={props.onValuesChange}
    >
      <Accordion type="single" collapsible className="px-0">
        <SettingAccordionItem
          value="timezone"
          title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
          description={t("setup:SETUP_TIMEZONE_DESC")}
          showSummary
          summary={currentTimezoneLabel}
          disabled={props.disabled}
          keepRendered
        >
          <Form.Item<SetupDefaultsDraft>
            name="timezone"
            rules={[{ required: true, message: t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED") }]}
            style={{ marginBottom: 0 }}
          >
            <Select
              size="large"
              className="min-w-[260px]"
              disabled={props.disabled}
              options={timezoneItems}
              showSearch
              optionFilterProp="label"
              placement="bottomLeft"
              dropdownStyle={{ zIndex: SETUP_SELECT_DROPDOWN_Z_INDEX }}
            />
          </Form.Item>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="locale"
          title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
          description={t("setup:SETUP_LANGUAGE_DESC")}
          showSummary
          summary={currentLocaleLabel}
          disabled={props.disabled}
          keepRendered
        >
          <Form.Item<SetupDefaultsDraft>
            name="locale"
            rules={[{ required: true, message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }]}
            style={{ marginBottom: 0 }}
          >
            <Select
              size="large"
              className="min-w-[220px]"
              disabled={props.disabled}
              options={localeItems}
              placement="bottomLeft"
              dropdownStyle={{ zIndex: SETUP_SELECT_DROPDOWN_Z_INDEX }}
            />
          </Form.Item>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="dateFormat"
          title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
          description={t("setup:SETUP_DATE_FORMAT_DESC")}
          showSummary
          summary={currentDateFormatLabel}
          disabled={props.disabled}
          keepRendered
        >
          <Form.Item<SetupDefaultsDraft>
            name="dateFormat"
            rules={[{ required: true, message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED") }]}
            style={{ marginBottom: 0 }}
          >
            <Select
              size="large"
              className="min-w-[320px]"
              disabled={props.disabled}
              options={dateFormatItems}
              placement="bottomLeft"
              dropdownStyle={{ zIndex: SETUP_SELECT_DROPDOWN_Z_INDEX }}
            />
          </Form.Item>
        </SettingAccordionItem>
      </Accordion>
    </Form>
  );
}
