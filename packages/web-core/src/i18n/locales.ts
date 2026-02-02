export type AppLocale = "zh-CN" | "en-US";

export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const satisfies readonly AppLocale[];
export const DEFAULT_LOCALE: AppLocale = "zh-CN";
export const DEFAULT_FALLBACK_LOCALE: AppLocale = "en-US";

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

/**
 * Minimal Accept-Language parser.
 *
 * Sprint 1 goal: pick a deterministic locale without pulling in heavy i18n libs.
 */
export function detectRequestLocaleFromHeaders(
  headers: Record<string, string> | null | undefined,
): AppLocale {
  const acceptLanguage = headers?.["accept-language"] ?? headers?.["Accept-Language"];
  return detectLocaleFromAcceptLanguage(acceptLanguage);
}

export function detectLocaleFromAcceptLanguage(acceptLanguage: string | undefined): AppLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const s = acceptLanguage.toLowerCase();
  // Very small heuristic: prefer zh if present, otherwise en.
  if (s.includes("zh")) return "zh-CN";
  if (s.includes("en")) return "en-US";
  return DEFAULT_LOCALE;
}
