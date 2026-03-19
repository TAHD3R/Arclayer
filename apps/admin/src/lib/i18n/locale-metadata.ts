import { SUPPORTED_LOCALES, type AppLocale } from "@arclayer/runtime/i18n";

type TranslateFn = (key: string) => string;

type KnownLocaleMetadata = {
  fallbackLabel: string;
  flagCountryCode: string;
  shortLabel: string;
  translationKey?: string;
};

export type LocaleMetadata = {
  code: string;
  flagCountryCode: string;
  label: string;
  shortLabel: string;
};

const KNOWN_LOCALE_METADATA = {
  "zh-CN": {
    translationKey: "account:ACCOUNT_LANGUAGE_ZH",
    fallbackLabel: "简体中文",
    shortLabel: "中文",
    flagCountryCode: "cn",
  },
  "en-US": {
    translationKey: "account:ACCOUNT_LANGUAGE_EN",
    fallbackLabel: "English",
    shortLabel: "EN",
    flagCountryCode: "us",
  },
} as const satisfies Record<AppLocale, KnownLocaleMetadata>;

const LANGUAGE_TO_FLAG_COUNTRY = {
  de: "de",
  en: "us",
  es: "es",
  fr: "fr",
  it: "it",
  ja: "jp",
  ko: "kr",
  pt: "pt",
  zh: "cn",
} as const;

function parseLocaleParts(locale: string) {
  const normalized = String(locale || "").trim();
  const [language = "", region = ""] = normalized.split("-");
  return {
    code: normalized,
    language: language.toLowerCase(),
    region: region.toLowerCase(),
  };
}

function resolveDisplayName(locale: string): string {
  const { code, language, region } = parseLocaleParts(locale);
  const languageName = new Intl.DisplayNames(undefined, { type: "language" }).of(language);
  if (!region) return languageName || code;
  const regionName = new Intl.DisplayNames(undefined, { type: "region" }).of(region.toUpperCase());
  if (!languageName || !regionName) return code;
  return `${languageName} (${regionName})`;
}

function resolveShortLabel(locale: string): string {
  const { language, region } = parseLocaleParts(locale);
  if (region) return region.toUpperCase();
  return language.toUpperCase() || locale;
}

function resolveFlagCountryCode(locale: string): string {
  const { language, region } = parseLocaleParts(locale);
  if (region) return region;
  return LANGUAGE_TO_FLAG_COUNTRY[language as keyof typeof LANGUAGE_TO_FLAG_COUNTRY] ?? "un";
}

export function getLocaleMetadata(locale: string, t?: TranslateFn): LocaleMetadata {
  const { code } = parseLocaleParts(locale);
  const known = KNOWN_LOCALE_METADATA[code as AppLocale];
  if (known) {
    return {
      code,
      label: known.translationKey && t ? t(known.translationKey) : known.fallbackLabel,
      shortLabel: known.shortLabel,
      flagCountryCode: known.flagCountryCode,
    };
  }

  return {
    code,
    label: resolveDisplayName(code),
    shortLabel: resolveShortLabel(code),
    flagCountryCode: resolveFlagCountryCode(code),
  };
}

export function parseLocaleCodes(input: string | readonly string[]): string[] {
  const values = Array.isArray(input) ? input : String(input || "").split(/[|,;]/);
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function buildLocaleDisplaySummary(
  input: string | readonly string[],
  t?: TranslateFn,
  maxVisible = 2,
) {
  const all = parseLocaleCodes(input);
  const visible = all.slice(0, maxVisible);
  return {
    all,
    visible,
    visibleMetadata: visible.map((locale) => getLocaleMetadata(locale, t)),
    remainingCount: Math.max(0, all.length - visible.length),
  };
}

export function buildSupportedLocaleOptions(
  locales: readonly string[] = SUPPORTED_LOCALES,
  t?: TranslateFn,
): Array<{ value: string; label: string }> {
  return locales.map((locale) => {
    const metadata = getLocaleMetadata(locale, t);
    return {
      value: locale,
      label: metadata.label,
    };
  });
}
