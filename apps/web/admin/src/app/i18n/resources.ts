import zhCommon from "@locales/zh-CN/common.json";
import zhErrors from "@locales/zh-CN/errors.json";
import zhAuth from "@locales/zh-CN/auth.json";
import zhPlugin from "@locales/zh-CN/plugin.json";

import enCommon from "@locales/en-US/common.json";
import enErrors from "@locales/en-US/errors.json";
import enAuth from "@locales/en-US/auth.json";
import enPlugin from "@locales/en-US/plugin.json";

export const I18N_NAMESPACES = ["common", "errors", "auth", "plugin"] as const;

export const i18nResources = {
  "zh-CN": {
    common: zhCommon,
    errors: zhErrors,
    auth: zhAuth,
    plugin: zhPlugin,
  },
  "en-US": {
    common: enCommon,
    errors: enErrors,
    auth: enAuth,
    plugin: enPlugin,
  },
} as const;

export type AppLocale = keyof typeof i18nResources;
