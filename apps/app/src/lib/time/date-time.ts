import { FULL_DATE_TIME_FORMAT } from "@/lib/time/datetime-config";

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

function resolveZonedParts(params: {
  date: Date;
  locale: string;
  timeZone: string;
  includeTime: boolean;
}): Record<(typeof DATE_PART_TYPES)[number], string | null> | null {
  const formatter = new Intl.DateTimeFormat(params.locale || undefined, {
    timeZone: params.timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(params.includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : null),
  });
  const parts = formatter.formatToParts(params.date);
  const values = Object.fromEntries(
    DATE_PART_TYPES.map((type) => [type, pickPart(parts, type)]),
  ) as Record<(typeof DATE_PART_TYPES)[number], string | null>;

  if (!values.year || !values.month || !values.day) {
    return null;
  }

  if (params.includeTime && (!values.hour || !values.minute)) {
    return null;
  }

  return values;
}

function formatLegacyPattern(params: {
  pattern: string;
  parts: Record<(typeof DATE_PART_TYPES)[number], string | null>;
  includeTime: boolean;
}): string {
  const { pattern, parts, includeTime } = params;
  const year = parts.year ?? "0000";
  const month = parts.month ?? "00";
  const day = parts.day ?? "00";
  const hour = parts.hour ?? "00";
  const minute = parts.minute ?? "00";

  const dateText =
    pattern === "MM/dd/yyyy"
      ? `${month}/${day}/${year}`
      : pattern === "dd/MM/yyyy"
        ? `${day}/${month}/${year}`
        : pattern === "yyyy/MM/dd"
          ? `${year}/${month}/${day}`
          : `${year}-${month}-${day}`;

  return includeTime ? `${dateText} ${hour}:${minute}` : dateText;
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
  const parts = resolveZonedParts({ ...params, includeTime });
  if (!parts) {
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

  if (pattern === FULL_DATE_TIME_FORMAT) {
    return new Intl.DateTimeFormat(params.locale || undefined, {
      timeZone: params.timeZone || undefined,
      year: "numeric",
      month: "long",
      day: "numeric",
      ...(includeTime
        ? {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }
        : null),
    }).format(params.date);
  }

  return formatLegacyPattern({ pattern, parts, includeTime });
}
