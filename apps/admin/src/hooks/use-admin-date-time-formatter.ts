import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getOrganizationCoreSettings } from "@/api/organization-settings";
import { getCoreSettings } from "@/api/settings";
import { getProjectCoreSettings } from "@/api/settings";
import type { AppLocale } from "@/lib/i18n";
import { pickBool, pickString } from "@/lib/settings/general/utils";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { formatRelativeTime } from "@/lib/time/relative-time";
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
  useBrowserTimeZone?: boolean;
  useRelativeDateTime?: boolean;
};

function hasCompleteLocalization(candidate: LocalizationCandidate): boolean {
  return Boolean(
    candidate.dateFormat &&
    candidate.useBrowserTimeZone !== undefined &&
    candidate.useRelativeDateTime !== undefined &&
    (candidate.useBrowserTimeZone || candidate.timeZone),
  );
}

export type AdminLocalizationSnapshot = {
  locale: AppLocale;
  timeZone: string;
  dateFormat: string | undefined;
  useBrowserTimeZone: boolean;
  useRelativeDateTime: boolean;
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
  preferencesTimeZone: string | null;
  browserTimeZone: string;
};

export type AdminDateTimeFormatterParams = {
  projectId?: string | null;
  workspaceId?: string | null;
};

export function resolveAdminDateTimeContext(
  params: AdminDateTimeFormatterParams | undefined,
  workspaceIdFromStore: string | null | undefined,
): { projectId: string | null; workspaceId: string | null } {
  const projectId =
    params && Object.prototype.hasOwnProperty.call(params, "projectId")
      ? (params.projectId ?? null)
      : null;
  if (params && Object.prototype.hasOwnProperty.call(params, "workspaceId")) {
    return {
      projectId,
      workspaceId: params.workspaceId ?? null,
    };
  }
  return {
    projectId,
    workspaceId: workspaceIdFromStore ?? null,
  };
}

export function resolveAdminDateTimeWorkspaceId(
  params: AdminDateTimeFormatterParams | undefined,
  workspaceIdFromStore: string | null | undefined,
): string | null {
  return resolveAdminDateTimeContext(params, workspaceIdFromStore).workspaceId;
}

function readLocalizationCandidate(
  value: Record<string, unknown> | undefined,
  section: "site_localization" | "workspace_localization",
): LocalizationCandidate {
  const locale = (pickString(value, [section, "locale"]) as AppLocale | undefined) ?? undefined;
  const timeZone = pickString(value, [section, "timezone"]) ?? undefined;
  const dateFormat = pickString(value, [section, "date_format"]) ?? undefined;
  const useBrowserTimeZone = pickBool(value, [section, "use_browser_timezone"]);
  const useRelativeDateTime = pickBool(value, [section, "use_relative_datetime"]);

  return { locale, timeZone, dateFormat, useBrowserTimeZone, useRelativeDateTime };
}

export function formatAdminDateTimeValue(params: {
  date: Date | null;
  localization: AdminLocalizationSnapshot;
  options?: FormatDateTimeOptions;
}): string {
  const emptyValue = params.options?.emptyValue ?? "-";
  const invalidValue = params.options?.invalidValue ?? emptyValue;
  const includeTime = params.options?.includeTime ?? true;
  if (!params.date) return emptyValue;
  if (Number.isNaN(params.date.getTime())) return invalidValue;

  if (includeTime && params.localization.useRelativeDateTime) {
    const relative = formatRelativeTime(params.date, params.localization.locale);
    return relative || invalidValue;
  }

  return formatDateTimeWithPattern({
    date: params.date,
    locale: params.localization.locale,
    timeZone: params.localization.timeZone,
    dateFormat: params.localization.dateFormat,
    includeTime,
  });
}

export function resolveAdminLocalizationSnapshot(
  params: ResolveAdminLocalizationSnapshotParams,
): AdminLocalizationSnapshot {
  const useBrowserTimeZone =
    params.workspaceLocalization.useBrowserTimeZone ??
    params.organizationLocalization.useBrowserTimeZone ??
    true;
  const fallbackTimeZone =
    params.workspaceLocalization.timeZone ??
    params.organizationLocalization.timeZone ??
    params.browserTimeZone;

  return {
    locale: params.preferencesLocale,
    timeZone:
      params.preferencesTimeZone ??
      (useBrowserTimeZone ? params.browserTimeZone : fallbackTimeZone) ??
      params.browserTimeZone,
    dateFormat:
      params.workspaceLocalization.dateFormat ?? params.organizationLocalization.dateFormat,
    useBrowserTimeZone,
    useRelativeDateTime:
      params.workspaceLocalization.useRelativeDateTime ??
      params.organizationLocalization.useRelativeDateTime ??
      true,
  };
}

export function useAdminDateTimeFormatter(params?: AdminDateTimeFormatterParams) {
  const workspaceIdFromStore = useWorkspaceStore((state) => state.currentWorkspaceId);
  const preferencesLocale = usePreferencesStore((state) => state.locale);
  const preferencesTimeZone = usePreferencesStore((state) => state.timeZonePreference);

  const { projectId, workspaceId } = resolveAdminDateTimeContext(params, workspaceIdFromStore);
  const contextId = projectId || workspaceId;

  const contextQuery = useQuery({
    queryKey: projectId
      ? ["settings", "project", "core", projectId]
      : ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(contextId),
    queryFn: async () => {
      if (projectId) return getProjectCoreSettings(projectId);
      return getCoreSettings(String(workspaceId));
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const contextLocalization = useMemo<LocalizationCandidate>(() => {
    return readLocalizationCandidate(
      contextQuery.data?.value,
      projectId ? "site_localization" : "workspace_localization",
    );
  }, [contextQuery.data?.value, projectId]);

  const shouldFetchOrganizationLocalization = useMemo(() => {
    if (!contextId) return true;
    if (contextQuery.isLoading) return false;
    if (contextQuery.isError) return true;
    return !hasCompleteLocalization(contextLocalization);
  }, [
    contextId,
    contextLocalization.dateFormat,
    contextLocalization.locale,
    contextLocalization.timeZone,
    contextLocalization.useBrowserTimeZone,
    contextLocalization.useRelativeDateTime,
    contextQuery.isError,
    contextQuery.isLoading,
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
    const useBrowserTimeZone =
      typeof (value as { useBrowserTimeZone?: unknown } | undefined)?.useBrowserTimeZone ===
      "boolean"
        ? Boolean((value as { useBrowserTimeZone?: boolean }).useBrowserTimeZone)
        : undefined;
    const useRelativeDateTime =
      typeof (value as { useRelativeDateTime?: unknown } | undefined)?.useRelativeDateTime ===
      "boolean"
        ? Boolean((value as { useRelativeDateTime?: boolean }).useRelativeDateTime)
        : undefined;

    return { locale, timeZone, dateFormat, useBrowserTimeZone, useRelativeDateTime };
  }, [organizationQuery.data?.organizationLocalization]);

  const localization = useMemo(() => {
    return resolveAdminLocalizationSnapshot({
      workspaceLocalization: contextLocalization,
      organizationLocalization,
      preferencesLocale,
      preferencesTimeZone,
      browserTimeZone: getBrowserTimeZone(),
    });
  }, [contextLocalization, organizationLocalization, preferencesLocale, preferencesTimeZone]);

  const formatFromDate = useCallback(
    (date: Date | null, options: FormatDateTimeOptions = {}): string => {
      return formatAdminDateTimeValue({
        date,
        localization,
        options,
      });
    },
    [localization],
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

  const isLoading = contextQuery.isLoading || organizationQuery.isLoading;
  const isFetching = contextQuery.isFetching || organizationQuery.isFetching;
  const isError = shouldFetchOrganizationLocalization
    ? organizationQuery.isError && (!contextId || contextQuery.isError)
    : contextQuery.isError;
  const error = isError ? (organizationQuery.error ?? contextQuery.error) : null;
  const refetch = shouldFetchOrganizationLocalization
    ? organizationQuery.refetch
    : contextQuery.refetch;

  return {
    projectId,
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
