import { COMMON_TIMEZONES, DATE_FORMAT_ITEMS } from "@/constants/datetime";
import { type AppLocale } from "@/lib/i18n";

import { formatLocaleLabel } from "./utils";

export const DEFAULT_LOCALE: AppLocale = "zh-CN";
export const DEFAULT_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

const SUPPORTED_LOCALES: ReadonlyArray<AppLocale> = ["zh-CN", "en-US"];

export type LocalizationOption<T extends string = string> = {
  value: T;
  label: string;
};

export function buildLocaleOptions(
  t: (key: string) => string,
): Array<LocalizationOption<AppLocale>> {
  return SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: formatLocaleLabel(locale, t),
  }));
}

export function buildTimezoneOptions(currentTimezone?: string): Array<LocalizationOption> {
  const normalizedCurrentTimezone = (currentTimezone || "").trim();
  const values = [normalizedCurrentTimezone, ...COMMON_TIMEZONES].filter(Boolean);
  const deduped = Array.from(new Set(values));
  return deduped.map((timezone) => ({ value: timezone, label: timezone }));
}

export function buildDateFormatOptions(): Array<LocalizationOption> {
  return DATE_FORMAT_ITEMS.map((item) => ({
    value: item.value,
    label: item.label,
  }));
}

export function resolveDateFormatLabel(dateFormat: string | undefined): string {
  if (!dateFormat) {
    return DATE_FORMAT_ITEMS[0]?.label ?? DEFAULT_DATE_FORMAT;
  }

  return DATE_FORMAT_ITEMS.find((item) => item.value === dateFormat)?.label ?? dateFormat;
}
