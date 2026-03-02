import { normalizePathname } from "./route-entry";

export function joinLocalePath(locale: string, pathnameNoLocale: string): string {
  const loc = (locale || "").trim();
  const p = normalizePathname(pathnameNoLocale);
  if (!loc) return p;
  if (p === "/") return normalizePathname(`/${loc}`);
  return normalizePathname(`/${loc}${p}`);
}

export function canonicalizeLocale(candidate: string, supportedLocales: string[]): string | null {
  const c = (candidate || "").trim();
  if (!c) return null;
  const lower = c.toLowerCase();
  for (const s of supportedLocales) {
    if (typeof s !== "string") continue;
    const ss = s.trim();
    if (!ss) continue;
    if (ss.toLowerCase() === lower) return ss;
  }
  return null;
}

export function splitLocalePrefix(
  pathnameWithPotentialLocale: string,
  supportedLocales: string[],
): {
  prefixCandidate: string | null;
  canonicalLocaleFromUrl: string | null;
  pathnameNoLocale: string;
} {
  const pathname = normalizePathname(pathnameWithPotentialLocale);
  if (pathname === "/") {
    return { prefixCandidate: null, canonicalLocaleFromUrl: null, pathnameNoLocale: "/" };
  }

  const rest = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const [first, ...segments] = rest.split("/");
  const prefix = (first || "").trim();
  if (!prefix)
    return { prefixCandidate: null, canonicalLocaleFromUrl: null, pathnameNoLocale: pathname };

  const looksLikeLocale = /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})*$/.test(prefix);
  if (!looksLikeLocale) {
    return { prefixCandidate: null, canonicalLocaleFromUrl: null, pathnameNoLocale: pathname };
  }

  const canonical = canonicalizeLocale(prefix, supportedLocales);
  const noLocale = segments.length ? "/" + segments.join("/") : "/";
  return {
    prefixCandidate: prefix,
    canonicalLocaleFromUrl: canonical,
    pathnameNoLocale: normalizePathname(noLocale),
  };
}

export function resolveCookieLocale(
  headers: Record<string, string> | null | undefined,
  supportedLocales: string[],
): string | null {
  const cookie = headers?.cookie ?? headers?.Cookie;
  if (!cookie || typeof cookie !== "string") return null;

  const pairs = cookie
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    if (k !== "celestial_locale") continue;
    const v = pair.slice(idx + 1).trim();
    if (!v) return null;
    const decoded = safeDecodeURIComponent(v);
    return canonicalizeLocale(decoded, supportedLocales);
  }
  return null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
