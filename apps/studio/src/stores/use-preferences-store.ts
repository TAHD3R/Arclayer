import { create } from "zustand";

import { STORAGE_KEYS } from "@/constants/storage";
import type { AppLocale } from "@/lib/i18n/resources";
import { detectBrowserLocale, normalizeLocale, DEFAULT_LOCALE } from "@celestial/web-runtime/i18n";
import type { ThemeMode } from "@celestial/design-tokens/antd";

export type PreferencesState = {
  locale: AppLocale;
  themeMode: ThemeMode;
  setLocale: (locale: AppLocale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
};

function applyLocaleToDom(locale: AppLocale) {
  document.documentElement.lang = locale;
}

function applyThemeModeToDom(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
}

function getInitialLocale(): AppLocale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.locale);
    if (stored) return normalizeLocale(stored) as AppLocale;
  } catch {
    // ignore
  }
  return detectBrowserLocale() as AppLocale;
}

function getInitialThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.themeMode);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return "light";
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  locale: DEFAULT_LOCALE as AppLocale,
  themeMode: "light",

  setLocale: (locale) => {
    const next = (normalizeLocale(locale) || DEFAULT_LOCALE) as AppLocale;
    applyLocaleToDom(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.locale, next);
    } catch {
      // ignore
    }
    set({ locale: next });
  },
  setThemeMode: (mode) => {
    const next: ThemeMode = mode === "dark" ? "dark" : "light";
    applyThemeModeToDom(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.themeMode, next);
    } catch {
      // ignore
    }
    set({ themeMode: next });
  },
  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === "dark" ? "light" : "dark";
    get().setThemeMode(next);
  },
}));

let initialized = false;

export function initializePreferences() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;

  const locale = getInitialLocale();
  const themeMode = getInitialThemeMode();
  applyLocaleToDom(locale);
  applyThemeModeToDom(themeMode);
  usePreferencesStore.setState({ locale, themeMode });
}
