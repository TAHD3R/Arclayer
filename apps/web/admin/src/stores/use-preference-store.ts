import { create } from "zustand";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  detectBrowserLocale,
  i18n,
  type AppLocale,
  DEFAULT_LOCALE,
  normalizeLocale,
} from "@/lib/i18n";
import { type ThemeMode } from "@celestial/ui-theme/antd";

export type ThemePreference = ThemeMode | "system";
export type LocalePreferenceMode = "workspace" | "browser" | "explicit";

interface PreferencesState {
  themeMode: ThemeMode;
  themePreference: ThemePreference;
  locale: AppLocale;
  /**
   * Whether the user explicitly chose a locale:
   * - set: user preference (client will send X-Locale)
   * - null: no explicit preference (client won't send X-Locale)
   */
  localePreference: AppLocale | null;
  localePreferenceMode: LocalePreferenceMode;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePreference: (preference: ThemePreference) => void;
  toggleThemeMode: () => void;
  setLocale: (locale: AppLocale) => void;
  setBrowserLocale: () => void;
  /**
   * Apply an effective locale from workspace/site defaults when user is in workspace mode.
   *
   * Notes:
   * - Does NOT persist to localStorage.
   * - Does NOT set localePreference, so API requests won't send X-Locale.
   */
  setEffectiveLocale: (locale: AppLocale) => void;
  /**
   * Persist a workspace's default locale for faster bootstrapping on refresh.
   *
   * Notes:
   * - Does NOT change localePreference.
   * - Used to avoid "flash to browser language" before workspace settings are loaded.
   */
  cacheWorkspaceLocale: (workspaceId: string, locale: AppLocale) => void;
}

function normalizeThemeMode(input: unknown): ThemeMode {
  if (input === "dark" || input === "light") return input;
  return "light";
}

function normalizeThemePreference(input: unknown): ThemePreference {
  if (input === "system") return "system";
  return normalizeThemeMode(input);
}

function normalizeLocalePreferenceMode(input: unknown): LocalePreferenceMode {
  if (input === "explicit" || input === "browser" || input === "workspace") return input;
  return "workspace";
}

function detectSystemThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference === "system") return detectSystemThemeMode();
  return preference;
}

function getInitialThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";

  const fromDom = document.documentElement.dataset.theme;
  if (fromDom) return normalizeThemeMode(fromDom);

  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.themeMode);
    if (stored) return normalizeThemePreference(stored);
  } catch {
    // ignore storage errors
  }

  return "system";
}

function applyThemeModeToDom(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
}

function persistThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.themeMode, preference);
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

function clearPersistedLocale() {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.locale);
  } catch {
    // ignore storage errors
  }
}

function persistLocalePreferenceMode(mode: LocalePreferenceMode) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.localePreferenceMode, mode);
  } catch {
    // ignore storage errors
  }
}

type WorkspaceLocaleCache = Record<string, AppLocale | undefined>;

function readWorkspaceLocaleCache(): WorkspaceLocaleCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.workspaceLocaleCache);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as WorkspaceLocaleCache;
  } catch {
    return {};
  }
}

function writeWorkspaceLocaleCache(next: WorkspaceLocaleCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.workspaceLocaleCache, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function readPersistedLastWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.workspace);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const stateCandidate = (parsed as { state?: unknown }).state;
    if (!stateCandidate || typeof stateCandidate !== "object") return null;
    const lastWorkspaceId = (stateCandidate as { lastWorkspaceId?: unknown }).lastWorkspaceId;
    const normalized = typeof lastWorkspaceId === "string" ? lastWorkspaceId.trim() : "";
    return normalized ? normalized : null;
  } catch {
    return null;
  }
}

function applyLocaleToDom(locale: AppLocale) {
  document.documentElement.lang = locale;
}

function getInitialLocaleState(): {
  mode: LocalePreferenceMode;
  localePreference: AppLocale | null;
  locale: AppLocale;
} {
  if (typeof window === "undefined") {
    return {
      mode: "workspace",
      localePreference: null,
      locale: DEFAULT_LOCALE,
    };
  }

  let storedLocale: string | null = null;
  let storedModeRaw: string | null = null;
  try {
    storedLocale = window.localStorage.getItem(STORAGE_KEYS.locale);
    storedModeRaw = window.localStorage.getItem(STORAGE_KEYS.localePreferenceMode);
  } catch {
    // ignore storage errors
  }

  const storedMode = normalizeLocalePreferenceMode(storedModeRaw);
  const hasStoredMode = Boolean(storedModeRaw);

  // Backward compatibility: legacy clients only stored locale, which implies explicit mode.
  if ((hasStoredMode && storedMode === "explicit") || (!hasStoredMode && storedLocale)) {
    const explicitLocale = storedLocale ? normalizeLocale(storedLocale) : detectBrowserLocale();
    return {
      mode: "explicit",
      localePreference: explicitLocale,
      locale: explicitLocale,
    };
  }

  if (hasStoredMode && storedMode === "browser") {
    const browserLocale = detectBrowserLocale();
    return {
      mode: "browser",
      localePreference: null,
      locale: browserLocale,
    };
  }

  const lastWorkspaceId = readPersistedLastWorkspaceId();
  if (lastWorkspaceId) {
    const cache = readWorkspaceLocaleCache();
    const cached = cache[lastWorkspaceId];
    if (cached) {
      return {
        mode: "workspace",
        localePreference: null,
        locale: normalizeLocale(cached),
      };
    }
  }

  return {
    mode: "workspace",
    localePreference: null,
    locale: detectBrowserLocale(),
  };
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
    persistThemePreference(nextPreference);
    set({ themeMode: nextMode, themePreference: nextPreference });
  },

  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === "dark" ? "light" : "dark";
    get().setThemeMode(next);
  },

  setLocale: (locale) => {
    const next = normalizeLocale(locale);
    applyLocaleToDom(next);
    persistLocale(next);
    persistLocalePreferenceMode("explicit");
    set({ locale: next, localePreference: next, localePreferenceMode: "explicit" });
    void i18n.changeLanguage(next);
  },

  setBrowserLocale: () => {
    const next = detectBrowserLocale();
    applyLocaleToDom(next);
    clearPersistedLocale();
    persistLocalePreferenceMode("browser");
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
    const current = readWorkspaceLocaleCache();
    if (current[wid] === nextLocale) return;
    current[wid] = nextLocale;
    writeWorkspaceLocaleCache(current);
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
      if (m.type !== "attributes") continue;
      if (m.attributeName !== "data-theme") continue;

      const mode = normalizeThemeMode(document.documentElement.dataset.theme);
      const current = usePreferencesStore.getState().themeMode;
      if (mode === current) continue;

      persistThemePreference(mode);
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
