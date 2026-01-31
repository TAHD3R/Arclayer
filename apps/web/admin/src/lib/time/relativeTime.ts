export type RelativeTimeUnit = "year" | "month" | "week" | "day" | "hour" | "minute" | "second";

function roundTowardZero(value: number): number {
  // For relative time, rounding toward zero tends to read more naturally (avoid -0).
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

export function formatRelativeTime(input: string | Date, locale: string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return "";

  const diffMs = ms - Date.now();
  const diffSec = diffMs / 1000;

  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const format = (value: number, unit: RelativeTimeUnit) => rtf.format(value, unit);

  if (abs < 60) return format(roundTowardZero(diffSec), "second");
  if (abs < 60 * 60) return format(roundTowardZero(diffSec / 60), "minute");
  if (abs < 60 * 60 * 24) return format(roundTowardZero(diffSec / (60 * 60)), "hour");
  if (abs < 60 * 60 * 24 * 7) return format(roundTowardZero(diffSec / (60 * 60 * 24)), "day");
  if (abs < 60 * 60 * 24 * 30) return format(roundTowardZero(diffSec / (60 * 60 * 24 * 7)), "week");
  if (abs < 60 * 60 * 24 * 365)
    return format(roundTowardZero(diffSec / (60 * 60 * 24 * 30)), "month");
  return format(roundTowardZero(diffSec / (60 * 60 * 24 * 365)), "year");
}
