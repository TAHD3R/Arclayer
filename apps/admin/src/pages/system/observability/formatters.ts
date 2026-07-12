const MICROS_PER_CURRENCY_UNIT = 1_000_000;

export function formatInteger(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatCompactNumber(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatLatency(value: number, locale?: string): string {
  return `${formatInteger(value, locale)} ms`;
}

export function formatCostMicros(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value / MICROS_PER_CURRENCY_UNIT);
}

export function formatTrendValue(params: {
  value: number;
  kind: "count" | "latency" | "cost";
  locale?: string;
}): string {
  if (params.kind === "latency") return formatLatency(params.value, params.locale);
  if (params.kind === "cost") return formatCostMicros(params.value, params.locale);
  return formatInteger(params.value, params.locale);
}
