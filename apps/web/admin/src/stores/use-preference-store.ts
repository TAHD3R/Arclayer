import { create } from "zustand";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  detectBrowserLocale,
  i18n,
  type AppLocale,
  DEFAULT_LOCALE,
  normalizeLocale,
} from "@/lib/i18n";
import {
  readStorageItem,
  readStorageJson,
  removeStorageItem,
  writeStorageItem,
  writeStorageJson,
} from "@/lib/storage";
import {
  applyThemeModeToDom,
  normalizeThemeMode,
  normalizeThemePreference,
  resolveThemeMode,
  detectSystemThemeMode,
} from "@/lib/theme";
import type {
  LocalePreferenceMode,
  PreferencesState,
  ThemePreference,
  WorkspaceLocaleCache,
} from "@/types/stores";
import { type ThemeMode } from "@celestial/ui-theme/antd";

function normalizeLocalePreferenceMode(input: unknown): LocalePreferenceMode {
  if (input === "explicit" || input === "browser" || input === "workspace") return input;
  return "workspace";
}

function applyLocaleToDom(locale: AppLocale) {
  document.documentElement.lang = locale;
}

function getInitialThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";

  const fromDom = document.documentElement.dataset.theme;
  if (fromDom) return normalizeThemeMode(fromDom);

  const stored = readStorageItem(STORAGE_KEYS.themeMode);
  if (stored) return normalizeThemePreference(stored);

  return "system";
}

function readPersistedLastWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  const parsed = readStorageJson<{ state?: { lastWorkspaceId?: unknown } }>(STORAGE_KEYS.workspace);
  if (!parsed?.state) return null;
  const raw = parsed.state.lastWorkspaceId;
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return normalized || null;
}

function getInitialLocaleState(): {
  mode: LocalePreferenceMode;
  localePreference: AppLocale | null;
  locale: AppLocale;
} {
  if (typeof window === "undefined") {
    return { mode: "workspace", localePreference: null, locale: DEFAULT_LOCALE };
  }

  const storedLocale = readStorageItem(STORAGE_KEYS.locale);
  const storedModeRaw = readStorageItem(STORAGE_KEYS.localePreferenceMode);
  const storedMode = normalizeLocalePreferenceMode(storedModeRaw);
  const hasStoredMode = Boolean(storedModeRaw);

  if ((hasStoredMode && storedMode === "explicit") || (!hasStoredMode && storedLocale)) {
    const explicitLocale = storedLocale ? normalizeLocale(storedLocale) : detectBrowserLocale();
    return { mode: "explicit", localePreference: explicitLocale, locale: explicitLocale };
  }

  if (hasStoredMode && storedMode === "browser") {
    const browserLocale = detectBrowserLocale();
    return { mode: "browser", localePreference: null, locale: browserLocale };
  }

  const lastWorkspaceId = readPersistedLastWorkspaceId();
  if (lastWorkspaceId) {
    const cache = readStorageJson<WorkspaceLocaleCache>(STORAGE_KEYS.workspaceLocaleCache) ?? {};
    const cached = cache[lastWorkspaceId];
    if (cached) {
      return { mode: "workspace", localePreference: null, locale: normalizeLocale(cached) };
    }
  }

  return { mode: "workspace", localePreference: null, locale: detectBrowserLocale() };
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  themeMode: "light",
  themePreference: "light",
  locale: DEFAULT_LOCALE,
  localePreference: null,
  localePreferenceMode: "workspace",

  setThemeMode: (mode) => {
    get().setThemePreference(mode);
  },

  setThemePreference: (preference) => {
    const nextPreference = normalizeThemePreference(preference);
    const nextMode = resolveThemeMode(nextPreference);
    applyThemeModeToDom(nextMode);
    writeStorageItem(STORAGE_KEYS.themeMode, nextPreference);
    set({ themeMode: nextMode, themePreference: nextPreference });
  },

  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === "dark" ? "light" : "dark";
    get().setThemeMode(next);
  },

  setLocale: (locale) => {
    const next = normalizeLocale(locale);
    applyLocaleToDom(next);
    writeStorageItem(STORAGE_KEYS.locale, next);
    writeStorageItem(STORAGE_KEYS.localePreferenceMode, "explicit");
    set({ locale: next, localePreference: next, localePreferenceMode: "explicit" });
    void i18n.changeLanguage(next);
  },

  setBrowserLocale: () => {
    const next = detectBrowserLocale();
    applyLocaleToDom(next);
    removeStorageItem(STORAGE_KEYS.locale);
    writeStorageItem(STORAGE_KEYS.localePreferenceMode, "browser");
    set({ locale: next, localePreference: null, localePreferenceMode: "browser" });
    void i18n.changeLanguage(next);
  },

  setEffectiveLocale: (locale) => {
    if (get().localePreferenceMode !== "workspace") return;
    const next = normalizeLocale(locale);
    applyLocaleToDom(next);
    set({ locale: next, localePreference: null });
    void i18n.changeLanguage(next);
  },

  cacheWorkspaceLocale: (workspaceId, locale) => {
    const wid = String(workspaceId || "").trim();
    if (!wid) return;
    const nextLocale = normalizeLocale(locale);
    const current = readStorageJson<WorkspaceLocaleCache>(STORAGE_KEYS.workspaceLocaleCache) ?? {};
    if (current[wid] === nextLocale) return;
    current[wid] = nextLocale;
    writeStorageJson(STORAGE_KEYS.workspaceLocaleCache, current);
  },
}));

let isInitialized = false;
let themeObserver: MutationObserver | null = null;
let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null;

export function initializePreferences() {
  if (isInitialized) return;
  isInitialized = true;

  if (typeof window === "undefined") return;

  const initialThemePreference = getInitialThemePreference();
  const initialThemeMode = resolveThemeMode(initialThemePreference);
  const initialLocaleState = getInitialLocaleState();

  applyThemeModeToDom(initialThemeMode);
  applyLocaleToDom(initialLocaleState.locale);

  usePreferencesStore.setState({
    themeMode: initialThemeMode,
    themePreference: initialThemePreference,
    locale: initialLocaleState.locale,
    localePreference: initialLocaleState.localePreference,
    localePreferenceMode: initialLocaleState.mode,
  });

  themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "attributes" || m.attributeName !== "data-theme") continue;
      const mode = normalizeThemeMode(document.documentElement.dataset.theme);
      const current = usePreferencesStore.getState().themeMode;
      if (mode === current) continue;
      writeStorageItem(STORAGE_KEYS.themeMode, mode);
      usePreferencesStore.setState({ themeMode: mode, themePreference: mode });
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  systemThemeMediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  if (systemThemeMediaQuery) {
    systemThemeListener = () => {
      const state = usePreferencesStore.getState();
      if (state.themePreference !== "system") return;
      const nextMode = detectSystemThemeMode();
      applyThemeModeToDom(nextMode);
      usePreferencesStore.setState({ themeMode: nextMode });
    };
    systemThemeMediaQuery.addEventListener("change", systemThemeListener);
  }
}

export function teardownPreferences() {
  themeObserver?.disconnect();
  themeObserver = null;

  if (systemThemeMediaQuery && systemThemeListener) {
    systemThemeMediaQuery.removeEventListener("change", systemThemeListener);
  }
  systemThemeMediaQuery = null;
  systemThemeListener = null;

  isInitialized = false;
}
