import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { STORAGE_KEYS } from "@/constants/storage";
import { type AppLocale, I18N_NAMESPACES, i18nResources } from "@/utils/i18n/resources";

export type { AppLocale } from "@/utils/i18n/resources";

export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const satisfies readonly AppLocale[];
export const DEFAULT_LOCALE: AppLocale = "zh-CN";

export function normalizeLocale(input: unknown): AppLocale {
  if (input === "zh-CN" || input === "en-US") return input;
  return DEFAULT_LOCALE;
}

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;

  const lang = (navigator.language || "").toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  return "en-US";
}

export function getInitialLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.locale);
    if (stored) return normalizeLocale(stored);
  } catch {
    // ignore storage errors (private mode / disabled)
  }

  return detectBrowserLocale();
}

export async function initI18n(initialLocale: AppLocale): Promise<void> {
  if (i18n.isInitialized) return;

  await i18n.use(initReactI18next).init({
    resources: i18nResources,
    lng: initialLocale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    ns: [...I18N_NAMESPACES],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
  });
}

export { i18n };
