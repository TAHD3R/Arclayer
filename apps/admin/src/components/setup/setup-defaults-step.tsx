import { Form, Select } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { Accordion } from "@celestial/ui/accordion";
import { DEFAULT_TIMEZONE } from "@/constants/datetime";
import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";
import { type AppLocale } from "@/lib/i18n";
import {
  resolveLocalizationDateFormatSummary,
  resolveLocalizationTimeZoneSummary,
} from "@/lib/settings/general/datetime-localization";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
} from "@/lib/settings/general/localization-options";
import type { SetupDefaultsDraft } from "@/types/stores";

const SETUP_SELECT_DROPDOWN_Z_INDEX = 2600;

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
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
  const useBrowserTimeZone = Form.useWatch("useBrowserTimeZone", props.form) as boolean | undefined;
  const useRelativeDateTime = Form.useWatch("useRelativeDateTime", props.form) as
    | boolean
    | undefined;

  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const localeItems = useMemo(() => buildLocaleOptions(t), [t]);
  const timezoneItems = useMemo(() => buildTimezoneOptions(timezone), [timezone]);
  const dateFormatItems = useMemo(() => buildDateFormatOptions(), []);

  const currentTimezoneLabel = resolveLocalizationTimeZoneSummary({
    autoLabel: t("settings:SETTINGS_TIMEZONE_AUTO_SHORT"),
    browserTimeZone,
    timeZone: timezone || DEFAULT_TIMEZONE,
    useBrowserTimeZone,
  });
  const currentLocaleLabel =
    localeItems.find((item) => item.value === locale)?.label || localeItems[0]?.label;
  const currentDateFormatLabel = resolveLocalizationDateFormatSummary({
    dateFormat,
    relativeLabel: t("settings:SETTINGS_DATETIME_RELATIVE_SHORT"),
    useRelativeDateTime,
  });

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
            hidden
          >
            <input type="hidden" />
          </Form.Item>
          <Form.Item<SetupDefaultsDraft> name="useBrowserTimeZone" hidden>
            <input type="hidden" />
          </Form.Item>
          <TimezoneLocalizationControl
            selectValue={String(timezone || DEFAULT_TIMEZONE)}
            switchChecked={Boolean(useBrowserTimeZone)}
            switchLabel={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_TITLE")}
            switchDescription={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_DESC")}
            options={timezoneItems}
            onSelectChange={(value) => props.form.setFieldValue("timezone", value)}
            onSwitchChange={(checked) => props.form.setFieldValue("useBrowserTimeZone", checked)}
          />
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
            rules={[
              {
                required: true,
                message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
              },
            ]}
            hidden
          >
            <input type="hidden" />
          </Form.Item>
          <Form.Item<SetupDefaultsDraft> name="useRelativeDateTime" hidden>
            <input type="hidden" />
          </Form.Item>
          <DateTimeFormatLocalizationControl
            selectValue={String(dateFormat || "")}
            switchChecked={Boolean(useRelativeDateTime)}
            switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
            switchDescription={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC")}
            options={dateFormatItems}
            onSelectChange={(value) => props.form.setFieldValue("dateFormat", value)}
            onSwitchChange={(checked) => props.form.setFieldValue("useRelativeDateTime", checked)}
          />
        </SettingAccordionItem>
      </Accordion>
    </Form>
  );
}
