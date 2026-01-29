import type { AppLocale } from "@/utils/i18n";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function pickNumber(obj: unknown, path: readonly string[]): number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  if (typeof cur === "number" && Number.isFinite(cur)) return cur;
  if (typeof cur === "string" && cur.trim()) {
    const n = Number(cur);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function pickBool(obj: unknown, path: readonly string[]): boolean | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return typeof cur === "boolean" ? cur : undefined;
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
