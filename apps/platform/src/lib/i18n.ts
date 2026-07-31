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
import zhSetup from "@locales/zh-CN/setup.json";
import zhSavedViews from "@locales/zh-CN/savedViews.json";
import zhSiteDelivery from "@locales/zh-CN/siteDelivery.json";
import zhTenants from "@locales/zh-CN/tenants.json";

export const PLATFORM_LOCALES = ["zh-CN", "en-US"] as const;
export type PlatformLocale = (typeof PLATFORM_LOCALES)[number];

const namespaces = [
  "common",
  "navigation",
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
  const locale = window.localStorage.getItem("arclayer:platform:locale");
  if (locale === "zh-CN" || locale === "en-US") return locale;
  if (locale !== null) throw new Error("Invalid stored Platform locale preference");
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
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
