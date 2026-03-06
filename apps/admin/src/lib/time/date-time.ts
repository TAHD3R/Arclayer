import { FULL_DATE_TIME_FORMAT } from "@/constants/datetime";

export type DateFormatPattern =
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"
  | "MM/DD/YYYY"
  | "DD/MM/YYYY"
  | typeof FULL_DATE_TIME_FORMAT;

function pickPart(parts: Intl.DateTimeFormatPart[], type: string): string | null {
  const found = parts.find((p) => p.type === type);
  return found?.value ?? null;
}

function normalizePattern(input: string | undefined): DateFormatPattern {
  if (
    input === "YYYY-MM-DD" ||
    input === "YYYY/MM/DD" ||
    input === "MM/DD/YYYY" ||
    input === "DD/MM/YYYY" ||
    input === FULL_DATE_TIME_FORMAT
  ) {
    return input;
  }
  return "YYYY-MM-DD";
}

function formatFullDateTime(params: {
  date: Date;
  locale: string;
  timeZone: string;
  includeTime: boolean;
}): string {
  const formatter = new Intl.DateTimeFormat(params.locale || undefined, {
    timeZone: params.timeZone || undefined,
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(params.includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : null),
  });

  return formatter.format(params.date);
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

  if (pattern === FULL_DATE_TIME_FORMAT) {
    return formatFullDateTime({
      date: params.date,
      locale: params.locale,
      timeZone: params.timeZone,
      includeTime,
    });
  }

  const dtf = new Intl.DateTimeFormat(params.locale || undefined, {
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
  });

  const parts = dtf.formatToParts(params.date);
  const y = pickPart(parts, "year");
  const m = pickPart(parts, "month");
  const d = pickPart(parts, "day");
  const hh = pickPart(parts, "hour");
  const mm = pickPart(parts, "minute");

  if (!y || !m || !d) return dtf.format(params.date);

  const dateText = (() => {
    if (pattern === "YYYY/MM/DD") return `${y}/${m}/${d}`;
    if (pattern === "MM/DD/YYYY") return `${m}/${d}/${y}`;
    if (pattern === "DD/MM/YYYY") return `${d}/${m}/${y}`;
    return `${y}-${m}-${d}`;
  })();

  if (!includeTime) return dateText;
  if (!hh || !mm) return dateText;
  return `${dateText} ${hh}:${mm}`;
}
