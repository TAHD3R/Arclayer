import type { ThemeMode } from "@celestial/design-tokens/antd";

import type { AppLocale } from "@/lib/i18n";

export type ThemePreference = ThemeMode | "system";
export type LocalePreferenceMode = "workspace" | "browser" | "explicit";
export type WorkspaceLocaleCache = Record<string, AppLocale | undefined>;

export interface PreferencesState {
  themeMode: ThemeMode;
  themePreference: ThemePreference;
  locale: AppLocale;
  localePreference: AppLocale | null;
  localePreferenceMode: LocalePreferenceMode;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePreference: (preference: ThemePreference) => void;
  toggleThemeMode: () => void;
  setLocale: (locale: AppLocale) => void;
  setBrowserLocale: () => void;
  setEffectiveLocale: (locale: AppLocale) => void;
  cacheWorkspaceLocale: (workspaceId: string, locale: AppLocale) => void;
}
