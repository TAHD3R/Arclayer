import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@locales/en-US/common.json";
import enCommerce from "@locales/en-US/commerce.json";
import enCommunications from "@locales/en-US/communications.json";
import enExtensions from "@locales/en-US/extensions.json";
import enAi from "@locales/en-US/ai.json";
import enAccess from "@locales/en-US/access.json";
import enErrors from "@locales/en-US/errors.json";
import enInbox from "@locales/en-US/inbox.json";
import enMonitoring from "@locales/en-US/monitoring.json";
import enNavigation from "@locales/en-US/navigation.json";
import enOverview from "@locales/en-US/overview.json";
import enSetup from "@locales/en-US/setup.json";
import enSavedViews from "@locales/en-US/savedViews.json";
import enSiteDelivery from "@locales/en-US/siteDelivery.json";
import enTenants from "@locales/en-US/tenants.json";
import zhCommon from "@locales/zh-CN/common.json";
import zhCommerce from "@locales/zh-CN/commerce.json";
import zhCommunications from "@locales/zh-CN/communications.json";
import zhExtensions from "@locales/zh-CN/extensions.json";
import zhAi from "@locales/zh-CN/ai.json";
import zhAccess from "@locales/zh-CN/access.json";
import zhErrors from "@locales/zh-CN/errors.json";
import zhInbox from "@locales/zh-CN/inbox.json";
import zhMonitoring from "@locales/zh-CN/monitoring.json";
import zhNavigation from "@locales/zh-CN/navigation.json";
import zhOverview from "@locales/zh-CN/overview.json";
import zhSetup from "@locales/zh-CN/setup.json";
import zhSavedViews from "@locales/zh-CN/savedViews.json";
import zhSiteDelivery from "@locales/zh-CN/siteDelivery.json";
import zhTenants from "@locales/zh-CN/tenants.json";

export const PLATFORM_LOCALES = ["zh-CN", "en-US"] as const;
export type PlatformLocale = (typeof PLATFORM_LOCALES)[number];

export type PlatformLanguageCatalogEntry = Readonly<{
  locale: PlatformLocale;
  language_name: string;
  native_name: string;
  flag_code: string;
  enabled: boolean;
  is_default: boolean;
  sort_order: number;
  bundle_ready: boolean;
}>;
export type PlatformLanguageCatalogInput = Readonly<{
  locale: string;
  language_name: string;
  native_name: string;
  flag_code: string;
  enabled: boolean;
  is_default: boolean;
  sort_order: number;
  bundle_ready: boolean;
}>;

const LANGUAGE_CATALOG_STORAGE_KEY = "arclayer:platform:language-catalog";
const DEFAULT_LANGUAGE_CATALOG: readonly PlatformLanguageCatalogEntry[] = [
  {
    locale: "zh-CN",
    language_name: "Simplified Chinese",
    native_name: "简体中文",
    flag_code: "cn",
    enabled: true,
    is_default: true,
    sort_order: 0,
    bundle_ready: true,
  },
  {
    locale: "en-US",
    language_name: "English (United States)",
    native_name: "English",
    flag_code: "us",
    enabled: true,
    is_default: false,
    sort_order: 1,
    bundle_ready: true,
  },
];

type LanguageCatalogListener = (catalog: readonly PlatformLanguageCatalogEntry[]) => void;
const languageCatalogListeners = new Set<LanguageCatalogListener>();

function isPlatformLocale(value: string): value is PlatformLocale {
  return PLATFORM_LOCALES.includes(value as PlatformLocale);
}

function readStoredLanguageCatalog(): readonly PlatformLanguageCatalogEntry[] {
  const stored = window.localStorage.getItem(LANGUAGE_CATALOG_STORAGE_KEY);
  if (stored === null) return DEFAULT_LANGUAGE_CATALOG;
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Invalid stored Platform language catalog");
  }
  const catalog = parsed.map((entry): PlatformLanguageCatalogEntry => {
    if (!entry || typeof entry !== "object")
      throw new Error("Invalid stored Platform language catalog");
    const value = entry as Record<string, unknown>;
    if (typeof value.locale !== "string" || !isPlatformLocale(value.locale)) {
      throw new Error("Invalid stored Platform language catalog locale");
    }
    if (
      typeof value.language_name !== "string" ||
      typeof value.native_name !== "string" ||
      typeof value.flag_code !== "string" ||
      typeof value.enabled !== "boolean" ||
      typeof value.is_default !== "boolean" ||
      typeof value.sort_order !== "number" ||
      typeof value.bundle_ready !== "boolean"
    ) {
      throw new Error("Invalid stored Platform language catalog state");
    }
    return {
      locale: value.locale,
      language_name: value.language_name,
      native_name: value.native_name,
      flag_code: value.flag_code,
      enabled: value.enabled,
      is_default: value.is_default,
      sort_order: value.sort_order,
      bundle_ready: value.bundle_ready,
    };
  });
  if (
    !catalog.some((entry) => entry.enabled) ||
    catalog.filter((entry) => entry.is_default).length !== 1 ||
    new Set(catalog.map((entry) => entry.locale)).size !== catalog.length
  ) {
    throw new Error("Invalid stored Platform language catalog selection");
  }
  const defaultEntry = catalog.find((entry) => entry.is_default);
  if (!defaultEntry?.enabled) throw new Error("Invalid stored Platform language catalog default");
  return catalog.sort((left, right) => left.sort_order - right.sort_order);
}

let runtimeLanguageCatalog: readonly PlatformLanguageCatalogEntry[] = DEFAULT_LANGUAGE_CATALOG;
let hasLoadedLanguageCatalog = false;

function ensureRuntimeLanguageCatalog(): void {
  if (hasLoadedLanguageCatalog) return;
  if (typeof window === "undefined") return;
  runtimeLanguageCatalog = readStoredLanguageCatalog();
  hasLoadedLanguageCatalog = true;
}

export function getPlatformLanguageCatalog(): readonly PlatformLanguageCatalogEntry[] {
  ensureRuntimeLanguageCatalog();
  return runtimeLanguageCatalog;
}

export function subscribePlatformLanguageCatalog(listener: LanguageCatalogListener): () => void {
  languageCatalogListeners.add(listener);
  return () => languageCatalogListeners.delete(listener);
}

export function applyPlatformLanguageCatalog(
  entries: readonly PlatformLanguageCatalogInput[],
): void {
  ensureRuntimeLanguageCatalog();
  const catalog = entries.map((entry): PlatformLanguageCatalogEntry => {
    if (!isPlatformLocale(entry.locale)) {
      throw new Error("Unsupported Platform language catalog locale");
    }
    if (typeof entry.enabled !== "boolean" || typeof entry.is_default !== "boolean") {
      throw new Error("Invalid Platform language catalog state");
    }
    return {
      locale: entry.locale,
      language_name: entry.language_name,
      native_name: entry.native_name,
      flag_code: entry.flag_code,
      enabled: entry.enabled,
      is_default: entry.is_default,
      sort_order: entry.sort_order,
      bundle_ready: entry.bundle_ready,
    };
  });
  const defaultEntry = catalog.find((entry) => entry.is_default);
  if (
    !defaultEntry ||
    !defaultEntry.enabled ||
    !catalog.some((entry) => entry.enabled) ||
    catalog.filter((entry) => entry.is_default).length !== 1 ||
    new Set(catalog.map((entry) => entry.locale)).size !== catalog.length
  ) {
    throw new Error("Platform language catalog must have an enabled default locale");
  }
  runtimeLanguageCatalog = [...catalog].sort((left, right) => left.sort_order - right.sort_order);
  window.localStorage.setItem(LANGUAGE_CATALOG_STORAGE_KEY, JSON.stringify(runtimeLanguageCatalog));
  if (!runtimeLanguageCatalog.some((entry) => entry.locale === i18n.language && entry.enabled)) {
    const nextLocale = defaultEntry.locale;
    window.localStorage.setItem("arclayer:platform:locale", nextLocale);
    if (i18n.isInitialized) void i18n.changeLanguage(nextLocale);
  }
  languageCatalogListeners.forEach((listener) => listener(runtimeLanguageCatalog));
}

const namespaces = [
  "common",
  "navigation",
  "overview",
  "inbox",
  "monitoring",
  "access",
  "setup",
  "tenants",
  "savedViews",
  "commerce",
  "communications",
  "extensions",
  "ai",
  "siteDelivery",
  "errors",
] as const;
const resources = {
  "zh-CN": {
    common: zhCommon,
    commerce: zhCommerce,
    communications: zhCommunications,
    extensions: zhExtensions,
    ai: zhAi,
    siteDelivery: zhSiteDelivery,
    navigation: zhNavigation,
    overview: zhOverview,
    inbox: zhInbox,
    monitoring: zhMonitoring,
    access: zhAccess,
    errors: zhErrors,
    setup: zhSetup,
    tenants: zhTenants,
    savedViews: zhSavedViews,
  },
  "en-US": {
    common: enCommon,
    commerce: enCommerce,
    communications: enCommunications,
    extensions: enExtensions,
    ai: enAi,
    siteDelivery: enSiteDelivery,
    navigation: enNavigation,
    overview: enOverview,
    inbox: enInbox,
    monitoring: enMonitoring,
    access: enAccess,
    errors: enErrors,
    setup: enSetup,
    tenants: enTenants,
    savedViews: enSavedViews,
  },
} as const;

export function resolveInitialLocale(): PlatformLocale {
  ensureRuntimeLanguageCatalog();
  const locale = window.localStorage.getItem("arclayer:platform:locale");
  const catalog = getPlatformLanguageCatalog();
  if (locale === "zh-CN" || locale === "en-US") {
    if (catalog.some((entry) => entry.locale === locale && entry.enabled)) return locale;
    const defaultEntry = catalog.find((entry) => entry.is_default);
    if (defaultEntry) return defaultEntry.locale;
  }
  if (locale !== null) throw new Error("Invalid stored Platform locale preference");
  const browserLocale = window.navigator.language.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en-US";
  if (catalog.some((entry) => entry.locale === browserLocale && entry.enabled))
    return browserLocale;
  return catalog.find((entry) => entry.is_default)?.locale ?? "en-US";
}

export async function initializePlatformI18n(locale: PlatformLocale): Promise<void> {
  if (i18n.isInitialized) return;

  await i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: false,
    supportedLngs: [...PLATFORM_LOCALES],
    ns: [...namespaces],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    parseMissingKeyHandler: (key) => `[missing Platform translation: ${key}]`,
  });
}

export { i18n };
