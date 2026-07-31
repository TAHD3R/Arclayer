export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}

export function formatDuration(milliseconds: number): string {
  return milliseconds >= 1_000
    ? `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 0 : 1)} s`
    : `${milliseconds} ms`;
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatCostMicros(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value / 1_000_000);
}
