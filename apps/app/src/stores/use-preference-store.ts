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
  SidebarItemVisibility,
  SidebarVisibilityItemKey,
  ThemePreference,
  WorkspaceLocaleCache,
} from "@/types/stores";
import { type ThemeMode } from "@arclayer/ui/theme-mode";

const DEFAULT_SIDEBAR_ITEM_VISIBILITY: SidebarItemVisibility = {
  favorites: true,
};
const DEFAULT_SIDEBAR_WIDTH_PX = 220;
const MIN_SIDEBAR_WIDTH_PX = 180;
const MAX_SIDEBAR_WIDTH_PX = 320;
const DEFAULT_AI_DRAWER_WIDTH_PX = 380;
const MIN_AI_DRAWER_WIDTH_PX = 380;
const MAX_AI_DRAWER_WIDTH_PX = 960;

function normalizeSidebarWidthPx(input: unknown): number {
  const raw = typeof input === "number" ? input : Number(String(input));
  if (!Number.isFinite(raw)) return DEFAULT_SIDEBAR_WIDTH_PX;
  return clampInt(raw, MIN_SIDEBAR_WIDTH_PX, MAX_SIDEBAR_WIDTH_PX);
}

function normalizeAiDrawerWidthPx(input: unknown): number {
  const raw = typeof input === "number" ? input : Number(String(input));
  if (!Number.isFinite(raw)) return DEFAULT_AI_DRAWER_WIDTH_PX;
  return clampInt(raw, MIN_AI_DRAWER_WIDTH_PX, MAX_AI_DRAWER_WIDTH_PX);
}

function normalizeSidebarItemVisibility(input: unknown): SidebarItemVisibility {
  const record = input && typeof input === "object" ? input : {};
  return {
    favorites:
      typeof (record as Partial<Record<SidebarVisibilityItemKey, unknown>>).favorites === "boolean"
        ? Boolean((record as Partial<Record<SidebarVisibilityItemKey, unknown>>).favorites)
        : DEFAULT_SIDEBAR_ITEM_VISIBILITY.favorites,
  };
}

function normalizeLocalePreferenceMode(input: unknown): LocalePreferenceMode {
  if (input === "explicit" || input === "browser" || input === "workspace") return input;
  return "workspace";
}

function normalizeTimeZonePreference(input: unknown): string | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return null;
  try {
    // Validate by attempting to construct a formatter.
    // This avoids persisting invalid values that could break date formatting.
    Intl.DateTimeFormat(undefined, { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return null;
  }
}

function normalizeFontScalePreference(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "number" ? input : Number(String(input));
  if (!Number.isFinite(raw)) return null;
  // Keep a conservative range to avoid breaking layout.
  const clamped = Math.max(0.85, Math.min(1.25, raw));
  return Math.round(clamped * 100) / 100;
}

function normalizeFontWeightPreference(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "number" ? input : Number(String(input));
  if (!Number.isFinite(raw)) return null;
  const clamped = Math.max(300, Math.min(700, Math.round(raw)));
  return clamped;
}

function applyLocaleToDom(locale: AppLocale) {
  document.documentElement.lang = locale;
}

function applyReduceMotionToDom(reduced: boolean) {
  if (reduced) {
    document.documentElement.dataset.motion = "reduced";
    return;
  }
  delete document.documentElement.dataset.motion;
}

function applyContrastToDom(enabled: boolean) {
  if (enabled) {
    document.documentElement.dataset.contrast = "more";
    return;
  }
  delete document.documentElement.dataset.contrast;
}

const FONT_SIZE_VARS = [
  "--font-size-largetitle",
  "--font-size-title",
  "--font-size-title2",
  "--font-size-title3",
  "--font-size-headline",
  "--font-size-body",
  "--font-size-callout",
  "--font-size-footnote",
  "--font-size-caption",
] as const;

const FONT_WEIGHT_VARS = [
  "--font-weight-largetitle",
  "--font-weight-title",
  "--font-weight-title2",
  "--font-weight-title3",
  "--font-weight-headline",
  "--font-weight-body",
  "--font-weight-callout",
  "--font-weight-footnote",
  "--font-weight-caption",
] as const;

let baseFontSizesPx: Record<(typeof FONT_SIZE_VARS)[number], number> | null = null;
let baseFontWeights: Record<(typeof FONT_WEIGHT_VARS)[number], number> | null = null;

function parseLengthToPx(value: string, rootFontSizePx: number): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.endsWith("px")) {
    const n = Number(raw.replace("px", "").trim());
    return Number.isFinite(n) ? n : null;
  }
  if (raw.endsWith("rem")) {
    const n = Number(raw.replace("rem", "").trim());
    return Number.isFinite(n) ? n * rootFontSizePx : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function ensureTypographySnapshot() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const rootFontSizePx = Number.parseFloat(styles.fontSize || "16") || 16;

  if (!baseFontSizesPx) {
    baseFontSizesPx = Object.fromEntries(
      FONT_SIZE_VARS.map((k) => {
        const px = parseLengthToPx(styles.getPropertyValue(k), rootFontSizePx) ?? 16;
        return [k, px];
      }),
    ) as Record<(typeof FONT_SIZE_VARS)[number], number>;
  }

  if (!baseFontWeights) {
    baseFontWeights = Object.fromEntries(
      FONT_WEIGHT_VARS.map((k) => {
        const raw = styles.getPropertyValue(k).trim();
        const n = Number.parseInt(raw, 10);
        return [k, Number.isFinite(n) ? n : 400];
      }),
    ) as Record<(typeof FONT_WEIGHT_VARS)[number], number>;
  }
}

function applyFontScalePreferenceToDom(scale: number | null) {
  if (typeof window === "undefined") return;
  ensureTypographySnapshot();
  const root = document.documentElement;
  if (!baseFontSizesPx) return;

  if (!scale) {
    for (const key of FONT_SIZE_VARS) {
      root.style.removeProperty(key);
    }
    return;
  }

  for (const key of FONT_SIZE_VARS) {
    root.style.setProperty(key, `${baseFontSizesPx[key] * scale}px`);
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function applyFontWeightPreferenceToDom(weight: number | null) {
  if (typeof window === "undefined") return;
  ensureTypographySnapshot();
  const root = document.documentElement;
  if (!baseFontWeights) return;

  if (!weight) {
    for (const key of FONT_WEIGHT_VARS) {
      root.style.removeProperty(key);
    }
    return;
  }

  const delta = weight - baseFontWeights["--font-weight-body"];
  for (const key of FONT_WEIGHT_VARS) {
    const next = clampInt(baseFontWeights[key] + delta, 300, 800);
    root.style.setProperty(key, String(next));
  }
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

function resolveWorkspaceLocaleFallback(): AppLocale {
  const lastWorkspaceId = readPersistedLastWorkspaceId();
  if (lastWorkspaceId) {
    const cache = readStorageJson<WorkspaceLocaleCache>(STORAGE_KEYS.workspaceLocaleCache) ?? {};
    const cached = cache[lastWorkspaceId];
    if (cached) return normalizeLocale(cached);
  }
  return detectBrowserLocale();
}

let activeThemeModeOverride: { mode: ThemeMode } | null = null;

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  themeMode: "light",
  themePreference: "light",
  locale: DEFAULT_LOCALE,
  localePreference: null,
  localePreferenceMode: "workspace",
  timeZonePreference: null,
  reduceMotion: false,
  contrastMore: false,
  fontScalePreference: null,
  fontWeightPreference: null,
  sidebarOpen: true,
  sidebarWidthPx: DEFAULT_SIDEBAR_WIDTH_PX,
  aiDrawerWidthPx: DEFAULT_AI_DRAWER_WIDTH_PX,
  showNotificationsBadge: true,
  sidebarItemVisibility: DEFAULT_SIDEBAR_ITEM_VISIBILITY,

  setThemeMode: (mode) => {
    get().setThemePreference(mode);
  },

  setThemePreference: (preference) => {
    const nextPreference = normalizeThemePreference(preference);
    const nextMode = resolveThemeMode(nextPreference);
    const effectiveMode = activeThemeModeOverride?.mode ?? nextMode;
    applyThemeModeToDom(effectiveMode);
    writeStorageItem(STORAGE_KEYS.themeMode, nextPreference);
    set({ themeMode: effectiveMode, themePreference: nextPreference });
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

  setWorkspaceLocaleMode: () => {
    const next = resolveWorkspaceLocaleFallback();
    applyLocaleToDom(next);
    removeStorageItem(STORAGE_KEYS.locale);
    writeStorageItem(STORAGE_KEYS.localePreferenceMode, "workspace");
    set({ locale: next, localePreference: null, localePreferenceMode: "workspace" });
    void i18n.changeLanguage(next);
  },

  setTimeZonePreference: (timeZone) => {
    const next = normalizeTimeZonePreference(timeZone);
    if (!next) {
      removeStorageItem(STORAGE_KEYS.timeZonePreference);
      set({ timeZonePreference: null });
      return;
    }
    writeStorageItem(STORAGE_KEYS.timeZonePreference, next);
    set({ timeZonePreference: next });
  },

  setReduceMotion: (reduced) => {
    writeStorageItem(STORAGE_KEYS.reduceMotion, String(Boolean(reduced)));
    applyReduceMotionToDom(Boolean(reduced));
    set({ reduceMotion: Boolean(reduced) });
  },

  setContrastMore: (enabled) => {
    writeStorageItem(STORAGE_KEYS.contrastMore, String(Boolean(enabled)));
    applyContrastToDom(Boolean(enabled));
    set({ contrastMore: Boolean(enabled) });
  },

  setFontScalePreference: (scale) => {
    const next = normalizeFontScalePreference(scale);
    if (!next) {
      removeStorageItem(STORAGE_KEYS.fontScalePreference);
      applyFontScalePreferenceToDom(null);
      set({ fontScalePreference: null });
      return;
    }
    writeStorageItem(STORAGE_KEYS.fontScalePreference, String(next));
    applyFontScalePreferenceToDom(next);
    set({ fontScalePreference: next });
  },

  setFontWeightPreference: (weight) => {
    const next = normalizeFontWeightPreference(weight);
    if (!next) {
      removeStorageItem(STORAGE_KEYS.fontWeightPreference);
      applyFontWeightPreferenceToDom(null);
      set({ fontWeightPreference: null });
      return;
    }
    writeStorageItem(STORAGE_KEYS.fontWeightPreference, String(next));
    applyFontWeightPreferenceToDom(next);
    set({ fontWeightPreference: next });
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

  setSidebarOpen: (open) => {
    writeStorageItem(STORAGE_KEYS.sidebarOpen, String(open));
    set({ sidebarOpen: Boolean(open) });
  },

  setSidebarWidthPx: (widthPx) => {
    const next = normalizeSidebarWidthPx(widthPx);
    writeStorageItem(STORAGE_KEYS.sidebarWidthPx, String(next));
    set({ sidebarWidthPx: next });
  },

  setAiDrawerWidthPx: (widthPx) => {
    const next = normalizeAiDrawerWidthPx(widthPx);
    writeStorageItem(STORAGE_KEYS.aiDrawerWidthPx, String(next));
    set({ aiDrawerWidthPx: next });
  },

  setShowNotificationsBadge: (show) => {
    writeStorageItem(STORAGE_KEYS.showNotificationsBadge, String(show));
    set({ showNotificationsBadge: show });
  },

  setSidebarItemVisible: (key, visible) => {
    const current = get().sidebarItemVisibility;
    const next = {
      ...current,
      [key]: Boolean(visible),
    };
    writeStorageJson(STORAGE_KEYS.sidebarItemVisibility, next);
    set({ sidebarItemVisibility: next });
  },
}));

export function activateThemeModeOverride(mode: ThemeMode): () => void {
  if (activeThemeModeOverride) {
    throw new Error("A runtime theme mode override is already active");
  }

  const override = { mode };
  applyThemeModeToDom(mode);
  activeThemeModeOverride = override;
  usePreferencesStore.setState({ themeMode: mode });

  return () => {
    if (activeThemeModeOverride !== override) {
      throw new Error("Runtime theme mode override cleanup does not match the active override");
    }

    const restoredMode = resolveThemeMode(usePreferencesStore.getState().themePreference);
    applyThemeModeToDom(restoredMode);
    activeThemeModeOverride = null;
    usePreferencesStore.setState({ themeMode: restoredMode });
  };
}

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

  const sidebarOpenStored = readStorageItem(STORAGE_KEYS.sidebarOpen);
  const sidebarOpen = sidebarOpenStored ? sidebarOpenStored === "true" : true;
  const sidebarWidthPx = normalizeSidebarWidthPx(readStorageItem(STORAGE_KEYS.sidebarWidthPx));
  const aiDrawerWidthPx = normalizeAiDrawerWidthPx(readStorageItem(STORAGE_KEYS.aiDrawerWidthPx));
  const timeZonePreference = normalizeTimeZonePreference(
    readStorageItem(STORAGE_KEYS.timeZonePreference),
  );
  const reduceMotion = readStorageItem(STORAGE_KEYS.reduceMotion) === "true";
  const contrastMore = readStorageItem(STORAGE_KEYS.contrastMore) === "true";
  const fontScalePreference = normalizeFontScalePreference(
    readStorageItem(STORAGE_KEYS.fontScalePreference),
  );
  const fontWeightPreference = normalizeFontWeightPreference(
    readStorageItem(STORAGE_KEYS.fontWeightPreference),
  );
  const showNotificationsBadgeStored = readStorageItem(STORAGE_KEYS.showNotificationsBadge);
  const showNotificationsBadge = showNotificationsBadgeStored
    ? showNotificationsBadgeStored === "true"
    : true;
  const sidebarItemVisibility = normalizeSidebarItemVisibility(
    readStorageJson(STORAGE_KEYS.sidebarItemVisibility),
  );

  applyReduceMotionToDom(reduceMotion);
  applyContrastToDom(contrastMore);
  applyFontScalePreferenceToDom(fontScalePreference);
  applyFontWeightPreferenceToDom(fontWeightPreference);

  usePreferencesStore.setState({
    themeMode: initialThemeMode,
    themePreference: initialThemePreference,
    locale: initialLocaleState.locale,
    localePreference: initialLocaleState.localePreference,
    localePreferenceMode: initialLocaleState.mode,
    timeZonePreference,
    reduceMotion,
    contrastMore,
    fontScalePreference,
    fontWeightPreference,
    sidebarOpen,
    sidebarWidthPx,
    aiDrawerWidthPx,
    showNotificationsBadge,
    sidebarItemVisibility,
  });

  themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "attributes" || m.attributeName !== "data-theme") continue;
      const mode = normalizeThemeMode(document.documentElement.dataset.theme);
      if (activeThemeModeOverride) {
        const enforcedMode = activeThemeModeOverride.mode;
        if (mode !== enforcedMode) {
          applyThemeModeToDom(enforcedMode);
          usePreferencesStore.setState({ themeMode: enforcedMode });
        }
        continue;
      }
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
      const nextMode = activeThemeModeOverride?.mode ?? detectSystemThemeMode();
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
  activeThemeModeOverride = null;

  isInitialized = false;
}
