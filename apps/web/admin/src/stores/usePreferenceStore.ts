import { create } from "zustand";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  getInitialLocale,
  i18n,
  type AppLocale,
  DEFAULT_LOCALE,
  normalizeLocale,
} from "@/utils/i18n";
import { type ThemeMode } from "@celestial/ui-theme/antd";

interface PreferencesState {
  themeMode: ThemeMode;
  locale: AppLocale;
  showSidebarNotificationCenter: boolean;
  /**
   * Whether the user explicitly chose a locale:
   * - set: user preference (client will send X-Locale)
   * - null: no preference (client won't send X-Locale; server falls back to workspace default)
   */
  localePreference: AppLocale | null;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  setLocale: (locale: AppLocale) => void;
  /**
   * Apply an effective locale from workspace/site defaults when user has no explicit preference.
   *
   * Notes:
   * - Does NOT persist to localStorage.
   * - Does NOT set localePreference, so API requests won't send X-Locale.
   */
  setEffectiveLocale: (locale: AppLocale) => void;
  setShowSidebarNotificationCenter: (enabled: boolean) => void;
}

function normalizeThemeMode(input: unknown): ThemeMode {
  if (input === "dark" || input === "light") return input;
  return "light";
}

function detectSystemThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";

  // Prefer explicit attribute if present (source-of-truth is CSS vars).
  const fromDom = document.documentElement.dataset.theme;
  if (fromDom) return normalizeThemeMode(fromDom);

  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.themeMode);
    if (stored) return normalizeThemeMode(stored);
  } catch {
    // ignore storage errors
  }

  return detectSystemThemeMode();
}

function applyThemeModeToDom(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
}

function persistThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.themeMode, mode);
  } catch {
    // ignore storage errors
  }
}

function persistLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.locale, locale);
  } catch {
    // ignore storage errors
  }
}

function persistSidebarNotificationCenter(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.sidebarNotificationCenter, enabled ? "1" : "0");
  } catch {
    // ignore storage errors
  }
}

function getInitialSidebarNotificationCenterEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.sidebarNotificationCenter);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function applyLocaleToDom(locale: AppLocale) {
  document.documentElement.lang = locale;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  themeMode: "light",
  locale: DEFAULT_LOCALE,
  showSidebarNotificationCenter: true,
  localePreference: null,

  setThemeMode: (mode) => {
    applyThemeModeToDom(mode);
    persistThemeMode(mode);
    set({ themeMode: mode });
  },

  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === "dark" ? "light" : "dark";
    get().setThemeMode(next);
  },

  setLocale: (locale) => {
    const next = normalizeLocale(locale);
    applyLocaleToDom(next);
    persistLocale(next);
    set({ locale: next, localePreference: next });
    void i18n.changeLanguage(next);
  },

  setEffectiveLocale: (locale) => {
    const next = normalizeLocale(locale);
    applyLocaleToDom(next);
    // Do not persist; do not mark as explicit preference.
    set({ locale: next });
    void i18n.changeLanguage(next);
  },

  setShowSidebarNotificationCenter: (enabled) => {
    persistSidebarNotificationCenter(enabled);
    set({ showSidebarNotificationCenter: enabled });
  },
}));

let isInitialized = false;
let themeObserver: MutationObserver | null = null;

export function initializePreferences() {
  if (isInitialized) return;
  isInitialized = true;

  if (typeof window === "undefined") return;

  const initialThemeMode = getInitialThemeMode();

  // Locale has 2 concepts:
  // - locale: effective UI language used by admin app
  // - localePreference: whether user explicitly set it (controls X-Locale header)
  let localePreference: AppLocale | null = null;
  let initialLocale: AppLocale = DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.locale);
    if (stored) {
      localePreference = normalizeLocale(stored);
      initialLocale = localePreference;
    } else {
      initialLocale = getInitialLocale();
    }
  } catch {
    initialLocale = getInitialLocale();
  }

  applyThemeModeToDom(initialThemeMode);
  applyLocaleToDom(initialLocale);
  const sidebarNotificationCenterEnabled = getInitialSidebarNotificationCenterEnabled();

  usePreferencesStore.setState({
    themeMode: initialThemeMode,
    locale: initialLocale,
    showSidebarNotificationCenter: sidebarNotificationCenterEnabled,
    localePreference,
  });

  // Keep store in sync if something else toggles data-theme at runtime.
  themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "attributes") continue;
      if (m.attributeName !== "data-theme") continue;

      const mode = normalizeThemeMode(document.documentElement.dataset.theme);
      const current = usePreferencesStore.getState().themeMode;
      if (mode === current) continue;

      persistThemeMode(mode);
      usePreferencesStore.setState({ themeMode: mode });
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

export function teardownPreferences() {
  themeObserver?.disconnect();
  themeObserver = null;
  isInitialized = false;
}
