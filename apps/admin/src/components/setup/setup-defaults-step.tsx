import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";

import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { Accordion } from "@arclayer/ui/accordion";
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
import { SetupFieldShell, SetupSelectControl } from "./setup-form-controls";
import type { SetupDefaultsDraft } from "@/types/stores";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function SetupDefaultsStep(props: {
  form: UseFormReturn<SetupDefaultsDraft>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const values = props.form.watch();

  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const localeItems = useMemo(() => buildLocaleOptions(t), [t]);
  const timezoneItems = useMemo(() => buildTimezoneOptions(values.timezone), [values.timezone]);
  const dateFormatItems = useMemo(() => buildDateFormatOptions(), []);

  const currentTimezoneLabel = resolveLocalizationTimeZoneSummary({
    autoLabel: t("settings:SETTINGS_TIMEZONE_AUTO_SHORT"),
    browserTimeZone,
    timeZone: values.timezone || DEFAULT_TIMEZONE,
    useBrowserTimeZone: values.useBrowserTimeZone,
  });
  const currentLocaleLabel =
    localeItems.find((item) => item.value === values.locale)?.label || localeItems[0]?.label;
  const currentDateFormatLabel = resolveLocalizationDateFormatSummary({
    dateFormat: values.dateFormat,
    relativeLabel: t("settings:SETTINGS_DATETIME_RELATIVE_SHORT"),
    useRelativeDateTime: values.useRelativeDateTime,
  });

  return (
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
        <TimezoneLocalizationControl
          selectValue={String(values.timezone || DEFAULT_TIMEZONE)}
          switchChecked={Boolean(values.useBrowserTimeZone)}
          switchLabel={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_TITLE")}
          switchDescription={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_DESC")}
          options={timezoneItems}
          onSelectChange={(value) => props.form.setValue("timezone", value)}
          onSwitchChange={(checked) => props.form.setValue("useBrowserTimeZone", checked)}
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
        <SetupFieldShell
          error={
            props.form.formState.errors.locale?.message
              ? String(props.form.formState.errors.locale.message)
              : undefined
          }
        >
          <SetupSelectControl
            value={String(values.locale || (localeItems[0]?.value as AppLocale))}
            options={localeItems}
            onChange={(value) => props.form.setValue("locale", value as AppLocale)}
            disabled={props.disabled}
          />
        </SetupFieldShell>
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
        <DateTimeFormatLocalizationControl
          selectValue={String(values.dateFormat || "")}
          switchChecked={Boolean(values.useRelativeDateTime)}
          switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
          switchDescription={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC")}
          options={dateFormatItems}
          onSelectChange={(value) => props.form.setValue("dateFormat", value)}
          onSwitchChange={(checked) => props.form.setValue("useRelativeDateTime", checked)}
        />
      </SettingAccordionItem>
    </Accordion>
  );
}
