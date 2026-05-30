import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import type { LocalePreferenceMode, ThemePreference } from "@/types/stores";

type TranslateFn = (key: string) => string;

export type PreferenceSelectOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

export type LanguagePreferenceValue = "browser" | "workspace" | AppLocale;

type LanguagePreferenceDefaultMode = "browser" | "workspace";

export function buildLanguagePreferenceOptions(
  t: TranslateFn,
  options: { defaultMode?: LanguagePreferenceDefaultMode } = {},
): Array<PreferenceSelectOption<LanguagePreferenceValue>> {
  const defaultMode = options.defaultMode ?? "workspace";
  const defaultOption =
    defaultMode === "browser"
      ? { value: "browser" as const, label: t("ACCOUNT_LANGUAGE_SYSTEM_DEFAULT") }
      : { value: "workspace" as const, label: t("ME_PREF_LOCALE_MODE_WORKSPACE") };

  return [
    defaultOption,
    ...(buildSupportedLocaleOptions(SUPPORTED_LOCALES, t) as Array<
      PreferenceSelectOption<AppLocale>
    >),
  ];
}

export function resolveLanguagePreferenceValue(input: {
  locale: AppLocale;
  localePreference: AppLocale | null;
  localePreferenceMode: LocalePreferenceMode;
}): LanguagePreferenceValue {
  if (input.localePreferenceMode === "workspace") return "workspace";
  return input.localePreference ?? input.locale;
}

export function resolveAuthLanguagePreferenceValue(input: {
  locale: AppLocale;
  localePreference: AppLocale | null;
  localePreferenceMode: LocalePreferenceMode;
}): LanguagePreferenceValue {
  if (input.localePreferenceMode === "explicit") return input.localePreference ?? input.locale;
  return "browser";
}

export function applyLanguagePreferenceValue(
  value: LanguagePreferenceValue,
  actions: {
    setLocale: (locale: AppLocale) => void;
    setBrowserLocale?: () => void;
    setWorkspaceLocaleMode?: () => void;
  },
) {
  if (value === "browser") {
    actions.setBrowserLocale?.();
    return;
  }
  if (value === "workspace") {
    actions.setWorkspaceLocaleMode?.();
    return;
  }
  actions.setLocale(value);
}

export function buildThemePreferenceOptions(
  t: TranslateFn,
): Array<PreferenceSelectOption<ThemePreference>> {
  return [
    { value: "system", label: t("ACCOUNT_THEME_SYSTEM") },
    { value: "light", label: t("ACCOUNT_THEME_LIGHT") },
    { value: "dark", label: t("ACCOUNT_THEME_DARK") },
  ];
}
