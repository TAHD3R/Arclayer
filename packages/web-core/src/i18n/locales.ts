export type AppLocale = "zh-CN" | "en-US";

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
