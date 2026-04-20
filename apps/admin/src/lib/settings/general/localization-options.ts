import { DATE_FORMAT_ITEMS, DEFAULT_DATE_FORMAT } from "@/lib/time/datetime-config";
import { FULL_DATE_TIME_FORMAT } from "@/lib/time/datetime-config";
import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";

export type LocalizationOption<T extends string = string> = {
  value: T;
  label: string;
};

export const RELATIVE_DATETIME_OPTION_VALUE = "__relative_datetime__";

export function buildLocaleOptions(
  t: (key: string) => string,
): Array<LocalizationOption<AppLocale>> {
  return buildSupportedLocaleOptions(SUPPORTED_LOCALES, t) as Array<LocalizationOption<AppLocale>>;
}

export function buildTimezoneOptions(currentTimezone?: string): Array<LocalizationOption> {
  const normalizedCurrentTimezone = (currentTimezone || "").trim();
  const values = [normalizedCurrentTimezone, ...listSupportedTimeZones()].filter(Boolean);
  const deduped = Array.from(new Set(values));
  return deduped.map((timezone) => ({ value: timezone, label: timezone }));
}

function listSupportedTimeZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    const supported = fn?.("timeZone") ?? [];
    return Array.isArray(supported) ? supported : [];
  } catch {
    return [];
  }
}

export function buildDateFormatOptions(t: (key: string) => string): Array<LocalizationOption> {
  const fixedDateFormatOptions: Array<LocalizationOption> = DATE_FORMAT_ITEMS.map((item) => ({
    value: item.value,
    label: item.label,
  }));

  return fixedDateFormatOptions.concat({
    value: FULL_DATE_TIME_FORMAT,
    label: t("settings:SETTINGS_LOCALIZATION_FULL_DATE_TIME_LABEL"),
  });
}

export function buildDateTimePreferenceOptions(
  t: (key: string) => string,
): Array<LocalizationOption> {
  return [
    {
      value: RELATIVE_DATETIME_OPTION_VALUE,
      label: t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE"),
    },
    ...buildDateFormatOptions(t),
  ];
}

export function resolveDateFormatLabel(
  dateFormat: string | undefined,
  t?: (key: string) => string,
): string {
  if (!dateFormat) {
    return DATE_FORMAT_ITEMS[0]?.label ?? DEFAULT_DATE_FORMAT;
  }

  if (dateFormat === FULL_DATE_TIME_FORMAT) {
    return t?.("settings:SETTINGS_LOCALIZATION_FULL_DATE_TIME_LABEL") ?? FULL_DATE_TIME_FORMAT;
  }

  return DATE_FORMAT_ITEMS.find((item) => item.value === dateFormat)?.label ?? dateFormat;
}
