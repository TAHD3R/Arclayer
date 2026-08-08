import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getPlatformLanguageCatalog,
  i18n,
  resolveInitialLocale,
  subscribePlatformLanguageCatalog,
  type PlatformLanguageCatalogEntry,
  type PlatformLocale,
} from "@/lib/i18n";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = Exclude<ThemePreference, "system">;

type PreferencesContextValue = {
  locale: PlatformLocale;
  setLocale: (locale: PlatformLocale) => void;
  languages: readonly PlatformLanguageCatalogEntry[];
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

const THEME_STORAGE_KEY = "arclayer:platform:theme";
const LOCALE_STORAGE_KEY = "arclayer:platform:locale";
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function resolveTheme(theme: ThemePreference): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readInitialTheme(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  if (stored !== null) throw new Error("Invalid stored Platform theme preference");
  return "system";
}

function readInitialLocale(): PlatformLocale {
  return resolveInitialLocale();
}

export function PlatformPreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readInitialTheme);
  const [locale, setLocaleState] = useState<PlatformLocale>(readInitialLocale);
  const [languages, setLanguages] = useState<readonly PlatformLanguageCatalogEntry[]>(
    getPlatformLanguageCatalog,
  );

  useEffect(
    () =>
      subscribePlatformLanguageCatalog((nextLanguages) => {
        setLanguages(nextLanguages);
        setLocaleState((currentLocale) => {
          if (
            nextLanguages.some((language) => language.locale === currentLocale && language.enabled)
          ) {
            return currentLocale;
          }
          return nextLanguages.find((language) => language.is_default)?.locale ?? currentLocale;
        });
      }),
    [],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
    };
    applyTheme();
    if (theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      locale,
      languages,
      setLocale: (nextLocale) => {
        if (!languages.some((language) => language.locale === nextLocale && language.enabled)) {
          throw new Error(`Unsupported enabled Platform locale: ${nextLocale}`);
        }
        window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
        document.documentElement.lang = nextLocale;
        setLocaleState(nextLocale);
        void i18n.changeLanguage(nextLocale);
      },
      theme,
      setTheme: (nextTheme) => {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        document.documentElement.classList.toggle("dark", resolveTheme(nextTheme) === "dark");
        setThemeState(nextTheme);
      },
    }),
    [languages, locale, theme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePlatformPreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePlatformPreferences must be used within its provider");
  return value;
}
