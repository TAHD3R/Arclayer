import type { ThemeMode } from "@arclayer/ui/theme-mode";

import type { AppLocale } from "@/lib/i18n";

export type ThemePreference = ThemeMode | "system";
export type LocalePreferenceMode = "workspace" | "browser" | "explicit";
export type WorkspaceLocaleCache = Record<string, AppLocale | undefined>;
export type SidebarVisibilityItemKey = "favorites";
export type SidebarItemVisibility = Record<SidebarVisibilityItemKey, boolean>;

export interface PreferencesState {
  themeMode: ThemeMode;
  themePreference: ThemePreference;
  locale: AppLocale;
  localePreference: AppLocale | null;
  localePreferenceMode: LocalePreferenceMode;
  timeZonePreference: string | null;
  reduceMotion: boolean;
  contrastMore: boolean;
  fontScalePreference: number | null;
  fontWeightPreference: number | null;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePreference: (preference: ThemePreference) => void;
  toggleThemeMode: () => void;
  setLocale: (locale: AppLocale) => void;
  setBrowserLocale: () => void;
  setWorkspaceLocaleMode: () => void;
  setTimeZonePreference: (timeZone: string | null) => void;
  setReduceMotion: (reduced: boolean) => void;
  setContrastMore: (enabled: boolean) => void;
  setFontScalePreference: (scale: number | null) => void;
  setFontWeightPreference: (weight: number | null) => void;
  setEffectiveLocale: (locale: AppLocale) => void;
  cacheWorkspaceLocale: (workspaceId: string, locale: AppLocale) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidthPx: number;
  setSidebarWidthPx: (widthPx: number) => void;
  aiDrawerWidthPx: number;
  setAiDrawerWidthPx: (widthPx: number) => void;
  showNotificationsBadge: boolean;
  setShowNotificationsBadge: (show: boolean) => void;
  sidebarItemVisibility: SidebarItemVisibility;
  setSidebarItemVisible: (key: SidebarVisibilityItemKey, visible: boolean) => void;
}
