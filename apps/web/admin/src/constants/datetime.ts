export const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
] as const;

export const DATE_FORMAT_ITEMS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-01-28)" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD (2026/01/28)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (01/28/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (28/01/2026)" },
] as const;
