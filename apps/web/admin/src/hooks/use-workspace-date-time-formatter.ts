import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCoreSettings } from "@/api/settings";
import type { AppLocale } from "@/lib/i18n";
import { pickString } from "@/lib/settings/general/utils";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function safeDateFromIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export type WorkspaceLocalizationSnapshot = {
  /**
   * 语言环境（Intl locale）。用于月/日/数字等本地化输出。
   */
  locale: AppLocale;
  /**
   * 时区（IANA TZ, e.g. "Asia/Shanghai"）。
   */
  timeZone: string;
  /**
   * 日期格式模式（例如 YYYY-MM-DD）。由工作区配置提供。
   */
  dateFormat: string | undefined;
};

export type FormatDateTimeOptions = {
  includeTime?: boolean;
  emptyValue?: string;
  invalidValue?: string;
};

export function useWorkspaceDateTimeFormatter(params?: { workspaceId?: string }) {
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const prefsLocale = usePreferencesStore((s) => s.locale);

  const workspaceId = params?.workspaceId ?? workspaceIdFromStore ?? null;

  const coreQuery = useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const localizationRaw = useMemo(() => {
    const value = coreQuery.data?.value;
    const locale =
      (pickString(value, ["workspace_localization", "locale"]) as AppLocale | undefined) ??
      undefined;
    const timezone = pickString(value, ["workspace_localization", "timezone"]) ?? undefined;
    const dateFormat = pickString(value, ["workspace_localization", "date_format"]) ?? undefined;
    return { locale, timezone, dateFormat } as const;
  }, [coreQuery.data?.value]);

  const localization: WorkspaceLocalizationSnapshot = useMemo(() => {
    return {
      locale: localizationRaw.locale ?? prefsLocale,
      timeZone: localizationRaw.timezone ?? getBrowserTimeZone(),
      dateFormat: localizationRaw.dateFormat ?? undefined,
    };
  }, [localizationRaw.dateFormat, localizationRaw.locale, localizationRaw.timezone, prefsLocale]);

  const formatFromDate = useCallback(
    (date: Date | null, opts: FormatDateTimeOptions = {}): string => {
      const emptyValue = opts.emptyValue ?? "-";
      const invalidValue = opts.invalidValue ?? emptyValue;
      if (!date) return emptyValue;
      if (Number.isNaN(date.getTime())) return invalidValue;

      return formatDateTimeWithPattern({
        date,
        locale: localization.locale,
        timeZone: localization.timeZone,
        dateFormat: localization.dateFormat,
        includeTime: opts.includeTime ?? true,
      });
    },
    [localization.dateFormat, localization.locale, localization.timeZone],
  );

  const formatDateTime = useCallback(
    (iso: string | null | undefined, opts: FormatDateTimeOptions = {}): string => {
      return formatFromDate(safeDateFromIso(iso), {
        ...opts,
        includeTime: opts.includeTime ?? true,
      });
    },
    [formatFromDate],
  );

  const formatDate = useCallback(
    (
      iso: string | null | undefined,
      opts: Omit<FormatDateTimeOptions, "includeTime"> = {},
    ): string => {
      return formatFromDate(safeDateFromIso(iso), { ...opts, includeTime: false });
    },
    [formatFromDate],
  );

  const formatDateTimeOrNull = useCallback(
    (iso: string | null | undefined): string | null => {
      const d = safeDateFromIso(iso);
      if (!d) return null;
      return formatFromDate(d, { emptyValue: "-", includeTime: true });
    },
    [formatFromDate],
  );

  return {
    ...coreQuery,
    workspaceId,
    localization,
    formatFromDate,
    formatDateTime,
    formatDate,
    formatDateTimeOrNull,
  } as const;
}
