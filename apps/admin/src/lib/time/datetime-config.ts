export const DATE_FORMAT_ITEMS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "FULL_DATE_TIME", label: "Full date & time" },
] as const;

export const FULL_DATE_TIME_FORMAT = "FULL_DATE_TIME";
export const DEFAULT_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

export type DateFormatValue = (typeof DATE_FORMAT_ITEMS)[number]["value"];
