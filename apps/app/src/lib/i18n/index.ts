import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { STORAGE_KEYS } from "@/constants/storage";
import { type AppLocale, I18N_NAMESPACES, i18nResources } from "@/lib/i18n/resources";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  normalizeLocale,
} from "@arclayer/web/i18n";

export type { AppLocale } from "@/lib/i18n/resources";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, detectBrowserLocale, normalizeLocale };
export {
  buildLocaleDisplaySummary,
  buildSupportedLocaleOptions,
  getLocaleMetadata,
  parseLocaleCodes,
} from "@/lib/i18n/locale-metadata";

export function getInitialLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.locale);
    if (stored) return normalizeLocale(stored);
  } catch (err) {
    console.error("[i18n] Failed to read locale from localStorage", err);
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
