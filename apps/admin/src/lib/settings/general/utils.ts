import type { AppLocale } from "@/lib/i18n";

function walkPath(obj: unknown, path: readonly string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function normalizeOptionalString(value: string | undefined): string | null {
  const raw = (value || "").trim();
  return raw ? raw : null;
}

export function isValidHttpUrlOrAbsolutePath(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw) return true;
  if (raw.startsWith("/")) return true;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatSummaryText(value: string | undefined, maxLen = 48): string {
  const raw = (value || "").trim();
  if (!raw) return "-";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}...`;
}

export function pickString(obj: unknown, path: readonly string[]): string | undefined {
  const value = walkPath(obj, path);
  return typeof value === "string" ? value : undefined;
}

export function pickNumber(obj: unknown, path: readonly string[]): number | undefined {
  const value = walkPath(obj, path);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function pickBool(obj: unknown, path: readonly string[]): boolean | undefined {
  const value = walkPath(obj, path);
  return typeof value === "boolean" ? value : undefined;
}

export function pickStringArray(obj: unknown, path: readonly string[]): string[] | undefined {
  const value = walkPath(obj, path);
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function formatLocaleLabel(locale: AppLocale, t: (key: string) => string): string {
  return locale === "zh-CN" ? t("account:ACCOUNT_LANGUAGE_ZH") : t("account:ACCOUNT_LANGUAGE_EN");
}

export function buildS3Summary(params: {
  endpointUrl: string | undefined;
  bucket: string | undefined;
  region: string | undefined;
}): string | null {
  const endpoint = (params.endpointUrl || "").trim();
  const bucket = (params.bucket || "").trim();
  const region = (params.region || "").trim();
  if (!endpoint && !bucket) return null;

  let host = endpoint;
  try {
    host = new URL(endpoint).host;
  } catch {
    // ignore
  }

  const parts = [bucket || null, host || null, region || null].filter(Boolean);
  return parts.join(" / ");
}
