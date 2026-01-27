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
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  setLocale: (locale: AppLocale) => void;
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

function applyLocaleToDom(locale: AppLocale) {
  document.documentElement.lang = locale;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  themeMode: "light",
  locale: DEFAULT_LOCALE,

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
    set({ locale: next });
    void i18n.changeLanguage(next);
  },
}));

let isInitialized = false;
let themeObserver: MutationObserver | null = null;

export function initializePreferences() {
  if (isInitialized) return;
  isInitialized = true;

  if (typeof window === "undefined") return;

  const initialThemeMode = getInitialThemeMode();

  const initialLocale = getInitialLocale();

  applyThemeModeToDom(initialThemeMode);
  applyLocaleToDom(initialLocale);

  usePreferencesStore.setState({
    themeMode: initialThemeMode,
    locale: initialLocale,
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
