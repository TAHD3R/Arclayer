import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getOrganizationCoreSettings } from "@/api/organization-settings";
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

type LocalizationCandidate = {
  locale?: AppLocale;
  timeZone?: string;
  dateFormat?: string;
};

function hasCompleteLocalization(candidate: LocalizationCandidate): boolean {
  return Boolean(candidate.locale && candidate.timeZone && candidate.dateFormat);
}

export type AdminLocalizationSnapshot = {
  locale: AppLocale;
  timeZone: string;
  dateFormat: string | undefined;
};

export type FormatDateTimeOptions = {
  includeTime?: boolean;
  emptyValue?: string;
  invalidValue?: string;
};

export type ResolveAdminLocalizationSnapshotParams = {
  workspaceLocalization: LocalizationCandidate;
  organizationLocalization: LocalizationCandidate;
  preferencesLocale: AppLocale;
  browserTimeZone: string;
};

export function resolveAdminLocalizationSnapshot(
  params: ResolveAdminLocalizationSnapshotParams,
): AdminLocalizationSnapshot {
  return {
    locale:
      params.workspaceLocalization.locale ??
      params.organizationLocalization.locale ??
      params.preferencesLocale,
    timeZone:
      params.workspaceLocalization.timeZone ??
      params.organizationLocalization.timeZone ??
      params.browserTimeZone,
    dateFormat:
      params.workspaceLocalization.dateFormat ?? params.organizationLocalization.dateFormat,
  };
}

export function useAdminDateTimeFormatter(params?: { workspaceId?: string | null }) {
  const workspaceIdFromStore = useWorkspaceStore((state) => state.currentWorkspaceId);
  const preferencesLocale = usePreferencesStore((state) => state.locale);

  const workspaceId = params?.workspaceId ?? workspaceIdFromStore ?? null;

  const workspaceQuery = useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceLocalization = useMemo<LocalizationCandidate>(() => {
    const value = workspaceQuery.data?.value;
    const locale =
      (pickString(value, ["workspace_localization", "locale"]) as AppLocale | undefined) ??
      undefined;
    const timeZone = pickString(value, ["workspace_localization", "timezone"]) ?? undefined;
    const dateFormat = pickString(value, ["workspace_localization", "date_format"]) ?? undefined;
    return { locale, timeZone, dateFormat };
  }, [workspaceQuery.data?.value]);

  const shouldFetchOrganizationLocalization = useMemo(() => {
    if (!workspaceId) return true;
    if (workspaceQuery.isLoading) return false;
    if (workspaceQuery.isError) return true;
    return !hasCompleteLocalization(workspaceLocalization);
  }, [
    workspaceId,
    workspaceLocalization.dateFormat,
    workspaceLocalization.locale,
    workspaceLocalization.timeZone,
    workspaceQuery.isError,
    workspaceQuery.isLoading,
  ]);

  const organizationQuery = useQuery({
    queryKey: ["organization", "settings", "core"],
    enabled: shouldFetchOrganizationLocalization,
    queryFn: async () => getOrganizationCoreSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const organizationLocalization = useMemo<LocalizationCandidate>(() => {
    const value = organizationQuery.data?.organizationLocalization;
    const rawLocale = typeof value?.locale === "string" ? value.locale : undefined;
    const locale = rawLocale ? (rawLocale as AppLocale) : undefined;
    const timeZone = typeof value?.timezone === "string" ? value.timezone : undefined;
    const dateFormat = typeof value?.dateFormat === "string" ? value.dateFormat : undefined;
    return { locale, timeZone, dateFormat };
  }, [organizationQuery.data?.organizationLocalization]);

  const localization = useMemo(() => {
    return resolveAdminLocalizationSnapshot({
      workspaceLocalization,
      organizationLocalization,
      preferencesLocale,
      browserTimeZone: getBrowserTimeZone(),
    });
  }, [organizationLocalization, preferencesLocale, workspaceLocalization]);

  const formatFromDate = useCallback(
    (date: Date | null, options: FormatDateTimeOptions = {}): string => {
      const emptyValue = options.emptyValue ?? "-";
      const invalidValue = options.invalidValue ?? emptyValue;
      if (!date) return emptyValue;
      if (Number.isNaN(date.getTime())) return invalidValue;

      return formatDateTimeWithPattern({
        date,
        locale: localization.locale,
        timeZone: localization.timeZone,
        dateFormat: localization.dateFormat,
        includeTime: options.includeTime ?? true,
      });
    },
    [localization.dateFormat, localization.locale, localization.timeZone],
  );

  const formatDateTime = useCallback(
    (iso: string | null | undefined, options: FormatDateTimeOptions = {}): string => {
      return formatFromDate(safeDateFromIso(iso), {
        ...options,
        includeTime: options.includeTime ?? true,
      });
    },
    [formatFromDate],
  );

  const formatDate = useCallback(
    (
      iso: string | null | undefined,
      options: Omit<FormatDateTimeOptions, "includeTime"> = {},
    ): string => {
      return formatFromDate(safeDateFromIso(iso), { ...options, includeTime: false });
    },
    [formatFromDate],
  );

  const formatDateTimeOrNull = useCallback(
    (iso: string | null | undefined): string | null => {
      const date = safeDateFromIso(iso);
      if (!date) return null;
      return formatFromDate(date, { emptyValue: "-", includeTime: true });
    },
    [formatFromDate],
  );

  const isLoading = workspaceQuery.isLoading || organizationQuery.isLoading;
  const isFetching = workspaceQuery.isFetching || organizationQuery.isFetching;
  const isError = shouldFetchOrganizationLocalization
    ? organizationQuery.isError && (!workspaceId || workspaceQuery.isError)
    : workspaceQuery.isError;
  const error = isError ? (organizationQuery.error ?? workspaceQuery.error) : null;
  const refetch = shouldFetchOrganizationLocalization
    ? organizationQuery.refetch
    : workspaceQuery.refetch;

  return {
    workspaceId,
    localization,
    formatFromDate,
    formatDateTime,
    formatDate,
    formatDateTimeOrNull,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } as const;
}
