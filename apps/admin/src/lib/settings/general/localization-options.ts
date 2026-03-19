import { DATE_FORMAT_ITEMS, DEFAULT_DATE_FORMAT } from "@/constants/datetime";
import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";

export type LocalizationOption<T extends string = string> = {
  value: T;
  label: string;
};

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
