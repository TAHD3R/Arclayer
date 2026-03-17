import { enUS, zhCN, type Locale } from "date-fns/locale";

import type { AppLocale } from "@/lib/i18n";

const DATE_FNS_LOCALE_MAP: Record<AppLocale, Locale> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export function resolveDateFnsLocale(locale: string | undefined): Locale {
  return DATE_FNS_LOCALE_MAP[(locale as AppLocale | undefined) ?? "zh-CN"] ?? zhCN;
}
