import { resolveDateFormatLabel } from "@/lib/settings/general/localization-options";

type DateFormatSummaryParams = {
  dateFormat?: string;
  relativeLabel?: string;
  useRelativeDateTime?: boolean;
};

type TimeZoneSummaryParams = {
  autoLabel?: string;
  browserTimeZone: string;
  timeZone?: string;
  useBrowserTimeZone?: boolean;
};

export function resolveLocalizationDateFormatSummary(params: DateFormatSummaryParams): string {
  if (params.useRelativeDateTime) {
    return params.relativeLabel ?? "Relative time";
  }

  return resolveDateFormatLabel(params.dateFormat);
}

export function resolveLocalizationTimeZoneSummary(params: TimeZoneSummaryParams): string {
  if (params.useBrowserTimeZone) {
    const autoLabel = params.autoLabel ?? "Auto";
    return `${autoLabel} (${params.browserTimeZone})`;
  }

  const manualTimeZone = String(params.timeZone || "").trim();
  return manualTimeZone || params.browserTimeZone;
}
