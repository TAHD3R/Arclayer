import { formatDistance } from "date-fns";

import { resolveDateFnsLocale } from "@/lib/time/date-fns-locale";

export function formatRelativeTimeAt(input: string | Date, locale: string, nowMs: number): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return "";

  return formatDistance(date, new Date(nowMs), {
    addSuffix: true,
    includeSeconds: true,
    locale: resolveDateFnsLocale(locale),
  });
}

export function formatRelativeTime(input: string | Date, locale: string): string {
  return formatRelativeTimeAt(input, locale, Date.now());
}
