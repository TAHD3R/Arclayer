import { format } from "date-fns";

import { FULL_DATE_TIME_FORMAT } from "@/lib/time/datetime-config";
import { resolveDateFnsLocale } from "@/lib/time/date-fns-locale";

export type DateFormatPattern =
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"
  | "MM/DD/YYYY"
  | "DD/MM/YYYY"
  | typeof FULL_DATE_TIME_FORMAT;

const DATE_PART_TYPES = ["year", "month", "day", "hour", "minute"] as const;
const LEGACY_PATTERN_MAP = {
  "YYYY-MM-DD": "yyyy-MM-dd",
  "YYYY/MM/DD": "yyyy/MM/dd",
  "MM/DD/YYYY": "MM/dd/yyyy",
  "DD/MM/YYYY": "dd/MM/yyyy",
} as const;

function pickPart(parts: Intl.DateTimeFormatPart[], type: string): string | null {
  const found = parts.find((p) => p.type === type);
  return found?.value ?? null;
}

function normalizePattern(input: string | undefined): string {
  if (!input) return LEGACY_PATTERN_MAP["YYYY-MM-DD"];
  if (input === FULL_DATE_TIME_FORMAT) return FULL_DATE_TIME_FORMAT;
  return LEGACY_PATTERN_MAP[input as keyof typeof LEGACY_PATTERN_MAP] ?? input;
}

function buildZonedDate(params: { date: Date; locale: string; timeZone: string }): Date | null {
  const formatter = new Intl.DateTimeFormat(params.locale || undefined, {
    timeZone: params.timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(params.date);
  const values = Object.fromEntries(
    DATE_PART_TYPES.map((type) => [type, pickPart(parts, type)]),
  ) as Record<(typeof DATE_PART_TYPES)[number], string | null>;

  if (!values.year || !values.month || !values.day || !values.hour || !values.minute) {
    return null;
  }

  return new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    ),
  );
}

function resolveDateTimePattern(pattern: string, includeTime: boolean): string {
  if (pattern === FULL_DATE_TIME_FORMAT) {
    return includeTime ? "PPpp" : "PP";
  }
  if (!includeTime) return pattern;
  return `${pattern} HH:mm`;
}

export function formatDateTimeWithPattern(params: {
  date: Date;
  locale: string;
  timeZone: string;
  dateFormat: string | undefined;
  includeTime?: boolean;
}): string {
  const pattern = normalizePattern(params.dateFormat);
  const includeTime = params.includeTime ?? true;
  const zonedDate = buildZonedDate(params);
  if (!zonedDate) {
    return new Intl.DateTimeFormat(params.locale || undefined, {
      timeZone: params.timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(includeTime
        ? {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }
        : null),
    }).format(params.date);
  }

  return format(zonedDate, resolveDateTimePattern(pattern, includeTime), {
    locale: resolveDateFnsLocale(params.locale),
  });
}
