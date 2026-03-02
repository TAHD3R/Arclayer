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

/**
 * Resolve a locale from Accept-Language against an arbitrary supported locale list.
 *
 * Notes:
 * - This is used for Portal website content, which supports arbitrary locales.
 * - We intentionally keep it lightweight (no external i18n negotiation libraries).
 * - Matching strategy:
 *   1) Exact match (case-insensitive) against supportedLocales
 *   2) Primary language match (e.g. fr-CA -> fr-FR or fr)
 *   3) defaultLocale
 */
export function resolveLocaleFromAcceptLanguage(
  acceptLanguage: string | undefined,
  supportedLocales: string[],
  defaultLocale: string,
): string {
  const supported = Array.isArray(supportedLocales) ? supportedLocales.filter(Boolean) : [];
  const supportedLower = supported.map((x) => x.toLowerCase());

  const def = (defaultLocale || "").trim();
  if (!acceptLanguage || !supported.length) return def || DEFAULT_LOCALE;

  const ranges = acceptLanguage
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [tagRaw, ...params] = part.split(";").map((x) => x.trim());
      const tag = (tagRaw || "").trim();
      let q = 1;
      for (const p of params) {
        if (!p.startsWith("q=")) continue;
        const n = Number.parseFloat(p.slice(2));
        if (Number.isFinite(n)) q = n;
      }
      return { tag, q };
    })
    .filter((x) => Boolean(x.tag))
    .sort((a, b) => b.q - a.q);

  for (const r of ranges) {
    const tagLower = r.tag.toLowerCase();
    const exactIdx = supportedLower.indexOf(tagLower);
    if (exactIdx >= 0) return supported[exactIdx] || def || DEFAULT_LOCALE;

    const primary = tagLower.split("-")[0] || "";
    if (!primary) continue;
    const primaryIdx = supportedLower.findIndex(
      (s) => s === primary || s.startsWith(primary + "-"),
    );
    if (primaryIdx >= 0) return supported[primaryIdx] || def || DEFAULT_LOCALE;
  }

  return def || DEFAULT_LOCALE;
}
