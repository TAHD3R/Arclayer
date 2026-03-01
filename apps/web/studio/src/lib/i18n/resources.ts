import zhCommon from "@locales/zh-CN/common.json";
import zhErrors from "@locales/zh-CN/errors.json";
import zhEditor from "@locales/zh-CN/editor.json";

import enCommon from "@locales/en-US/common.json";
import enErrors from "@locales/en-US/errors.json";
import enEditor from "@locales/en-US/editor.json";

export const I18N_NAMESPACES = ["common", "errors", "editor"] as const;

export const i18nResources = {
  "zh-CN": {
    common: zhCommon,
    errors: zhErrors,
    editor: zhEditor,
  },
  "en-US": {
    common: enCommon,
    errors: enErrors,
    editor: enEditor,
  },
} as const;

export type AppLocale = keyof typeof i18nResources;
