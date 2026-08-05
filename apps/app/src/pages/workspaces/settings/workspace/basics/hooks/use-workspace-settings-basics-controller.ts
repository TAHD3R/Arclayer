import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { listWorkspaceRoles } from "@/api/rbac";
import { getCoreSettings } from "@/api/settings";
import { getWorkspaceDetail } from "@/api/workspaces";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE } from "@/lib/time/datetime-config";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n";
import {
  resolveLocalizationDateFormatSummary,
  resolveLocalizationTimeZoneSummary,
} from "@/lib/settings/general/datetime-localization";
import {
  buildDateFormatOptions,
  buildDateTimePreferenceOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
} from "@/lib/settings/general/localization-options";
import { pickBool, pickString } from "@/lib/settings/general/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { AssignRoleDialogValues, WorkspaceSettingsFormValues } from "../../types";
import { resolveWorkspaceSettingsTabNavigation } from "../../utils";
import { buildWorkspaceRoleMetadata } from "./role-metadata";
import { useWorkspaceSettingsBasicsMutations } from "./use-workspace-settings-basics-mutations";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const DEFAULT_FORM_VALUES: WorkspaceSettingsFormValues = {
  name: "",
  description: "",
  locale: DEFAULT_LOCALE,
  timezone: DEFAULT_TIMEZONE,
  useBrowserTimeZone: true,
  dateFormat: DEFAULT_DATE_FORMAT,
  useRelativeDateTime: true,
  defaultRoleCode: "",
  assignRoleCode: "",
};

export function useWorkspaceSettingsBasicsController(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common", "setup"]);
  const navigate = useNavigate();
  const searchStr = useRouterState({
    select: (s) => s.location.searchStr,
    structuralSharing: true,
  });
  const queryClient = useQueryClient();

  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const localePreferenceMode = usePreferencesStore((state) => state.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((state) => state.setEffectiveLocale);
  const cacheWorkspaceLocale = usePreferencesStore((state) => state.cacheWorkspaceLocale);

  const form = useForm<WorkspaceSettingsFormValues>({ defaultValues: DEFAULT_FORM_VALUES });
  const assignRoleDialogForm = useForm<AssignRoleDialogValues>({
    defaultValues: { confirmName: "" },
  });
  const { savingKey, withSavingKey } = useSavingKey();
  const [assignRoleDialogOpen, setAssignRoleDialogOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setCurrentWorkspaceId(workspaceId);
  }, [setCurrentWorkspaceId, workspaceId]);

  const closeAssignRoleDialog = useCallback(() => {
    assignRoleDialogForm.reset();
    setAssignRoleDialogOpen(false);
  }, [assignRoleDialogForm]);

  const detailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceDetail(workspaceId),
    retry: false,
    meta: { silent: true },
  });

  const coreQuery = useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(workspaceId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const rolesQuery = useQuery({
    queryKey: ["workspace", "rbac", "roles", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceRoles(workspaceId, { page: 1, size: 200 }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const onTabChange = useCallback(
    (next: WorkspaceSettingsTabKey) => {
      const projectId = String(
        detailQuery.data?.project?.projectId ||
          useWorkspaceStore.getState().currentProjectId ||
          useWorkspaceStore.getState().lastProjectId ||
          "",
      ).trim();
      if (!projectId) {
        throw new Error("PROJECT_NOT_SELECTED");
      }
      void navigate({
        ...resolveWorkspaceSettingsTabNavigation(projectId, next, searchStr),
      });
    },
    [detailQuery.data?.project?.projectId, navigate, searchStr],
  );

  useEffect(() => {
    if (!detailQuery.data) return;
    if (!form.getFieldState("name").isDirty) {
      form.setValue("name", detailQuery.data.name, { shouldDirty: false });
    }
    if (!form.getFieldState("description").isDirty) {
      form.setValue("description", detailQuery.data.description ?? "", { shouldDirty: false });
    }
  }, [detailQuery.data, form]);

  useEffect(() => {
    if (!coreQuery.data) return;
    const value = coreQuery.data.value;
    const nextValues = {
      locale: normalizeLocale(
        pickString(value, ["workspace_localization", "locale"]) ?? DEFAULT_LOCALE,
      ),
      timezone: pickString(value, ["workspace_localization", "timezone"]) ?? DEFAULT_TIMEZONE,
      useBrowserTimeZone:
        pickBool(value, ["workspace_localization", "use_browser_timezone"]) ?? true,
      dateFormat:
        pickString(value, ["workspace_localization", "date_format"]) ?? DEFAULT_DATE_FORMAT,
      useRelativeDateTime:
        pickBool(value, ["workspace_localization", "use_relative_datetime"]) ?? true,
    };

    if (!form.getFieldState("locale").isDirty) {
      form.setValue("locale", nextValues.locale, { shouldDirty: false });
    }
    if (!form.getFieldState("timezone").isDirty) {
      form.setValue("timezone", nextValues.timezone, { shouldDirty: false });
    }
    if (!form.getFieldState("useBrowserTimeZone").isDirty) {
      form.setValue("useBrowserTimeZone", nextValues.useBrowserTimeZone, { shouldDirty: false });
    }
    if (!form.getFieldState("dateFormat").isDirty) {
      form.setValue("dateFormat", nextValues.dateFormat, { shouldDirty: false });
    }
    if (!form.getFieldState("useRelativeDateTime").isDirty) {
      form.setValue("useRelativeDateTime", nextValues.useRelativeDateTime, { shouldDirty: false });
    }
  }, [coreQuery.data, form]);

  useEffect(() => {
    const items = rolesQuery.data?.items ?? [];
    if (!items.length) return;
    const nextRoleCode = items.find((item) => item.isDefault)?.code ?? items[0]?.code;
    if (!nextRoleCode) return;

    if (!form.getFieldState("defaultRoleCode").isDirty) {
      form.setValue("defaultRoleCode", nextRoleCode, { shouldDirty: false });
    }
    if (!form.getFieldState("assignRoleCode").isDirty) {
      form.setValue("assignRoleCode", nextRoleCode, { shouldDirty: false });
    }
  }, [form, rolesQuery.data?.items]);

  const {
    patchWorkspaceMutation,
    patchWorkspaceCoreMutation,
    patchWorkspaceRolePolicyMutation,
    assignWorkspaceRoleMutation,
  } = useWorkspaceSettingsBasicsMutations({ workspaceId, t, queryClient });

  const disabled =
    detailQuery.isFetching ||
    coreQuery.isFetching ||
    rolesQuery.isFetching ||
    patchWorkspaceMutation.isPending ||
    patchWorkspaceCoreMutation.isPending ||
    patchWorkspaceRolePolicyMutation.isPending ||
    assignWorkspaceRoleMutation.isPending ||
    Boolean(savingKey);

  const initialWorkspaceName = detailQuery.data?.name ?? "";
  const persistedWorkspaceName = String(initialWorkspaceName || "").trim();
  const currentWorkspaceName =
    useWatch({ control: form.control, name: "name" }) ?? initialWorkspaceName;

  const initialWorkspaceDescription = detailQuery.data?.description ?? "";
  const persistedWorkspaceDescription = String(initialWorkspaceDescription || "").trim();
  const currentWorkspaceDescription =
    useWatch({ control: form.control, name: "description" }) ?? initialWorkspaceDescription;

  const initialWorkspaceLocale = normalizeLocale(
    pickString(coreQuery.data?.value, ["workspace_localization", "locale"]) ?? DEFAULT_LOCALE,
  );
  const initialWorkspaceTimezone =
    pickString(coreQuery.data?.value, ["workspace_localization", "timezone"]) ?? DEFAULT_TIMEZONE;
  const initialWorkspaceUseBrowserTimeZone =
    pickBool(coreQuery.data?.value, ["workspace_localization", "use_browser_timezone"]) ?? true;
  const initialWorkspaceDateFormat =
    pickString(coreQuery.data?.value, ["workspace_localization", "date_format"]) ??
    DEFAULT_DATE_FORMAT;
  const initialWorkspaceUseRelativeDateTime =
    pickBool(coreQuery.data?.value, ["workspace_localization", "use_relative_datetime"]) ?? true;

  const roleItems = rolesQuery.data?.items ?? [];
  const roleMetadata = useMemo(() => buildWorkspaceRoleMetadata(roleItems), [roleItems]);
  const initialDefaultRoleCode = roleMetadata.initialDefaultRoleCode;

  const workspaceLocale =
    useWatch({ control: form.control, name: "locale" }) ?? String(initialWorkspaceLocale);
  const workspaceTimezone =
    useWatch({ control: form.control, name: "timezone" }) ?? initialWorkspaceTimezone;
  const workspaceUseBrowserTimeZone =
    useWatch({ control: form.control, name: "useBrowserTimeZone" }) ??
    initialWorkspaceUseBrowserTimeZone;
  const workspaceDateFormat =
    useWatch({ control: form.control, name: "dateFormat" }) ?? initialWorkspaceDateFormat;
  const workspaceUseRelativeDateTime =
    useWatch({ control: form.control, name: "useRelativeDateTime" }) ??
    initialWorkspaceUseRelativeDateTime;
  const defaultRoleCode =
    useWatch({ control: form.control, name: "defaultRoleCode" }) ?? initialDefaultRoleCode;
  const assignRoleCode =
    useWatch({ control: form.control, name: "assignRoleCode" }) ?? initialDefaultRoleCode;

  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const localeOptions = useMemo(() => buildLocaleOptions(t), [t]);
  const timezoneOptions = useMemo(
    () => buildTimezoneOptions(workspaceTimezone || browserTimeZone),
    [browserTimeZone, workspaceTimezone],
  );
  const dateFormatOptions = useMemo(() => buildDateFormatOptions(t), [t]);
  const dateTimePreferenceOptions = useMemo(() => buildDateTimePreferenceOptions(t), [t]);

  const roleOptions = roleMetadata.roleOptions;
  const roleLabelMap = roleMetadata.roleLabelMap;
  const roleDescriptionMap = roleMetadata.roleDescriptionMap;

  const workspaceLocaleLabel =
    localeOptions.find((item) => item.value === workspaceLocale)?.label ?? workspaceLocale;
  const workspaceTimezoneLabel = resolveLocalizationTimeZoneSummary({
    timeZone: workspaceTimezone,
    browserTimeZone,
    useBrowserTimeZone: workspaceUseBrowserTimeZone,
    autoLabel: t("settings:SETTINGS_TIMEZONE_AUTO_SHORT"),
  });
  const workspaceDateFormatLabel = resolveLocalizationDateFormatSummary({
    dateFormat: String(workspaceDateFormat),
    useRelativeDateTime: workspaceUseRelativeDateTime,
    relativeLabel: t("settings:SETTINGS_DATETIME_RELATIVE_SHORT"),
    translate: t,
  });
  const defaultRoleLabel = roleLabelMap.get(String(defaultRoleCode)) ?? String(defaultRoleCode);
  const assignRoleLabel = roleLabelMap.get(String(assignRoleCode)) ?? String(assignRoleCode);
  const assignRoleDescription = roleDescriptionMap.get(String(assignRoleCode)) ?? null;

  const isWorkspaceNameDirty = (currentWorkspaceName || "") !== (initialWorkspaceName || "");
  const isWorkspaceDescriptionDirty =
    (currentWorkspaceDescription || "") !== (initialWorkspaceDescription || "");
  const isWorkspaceLocaleDirty = (workspaceLocale || "") !== String(initialWorkspaceLocale);
  const isWorkspaceTimezoneDirty =
    (workspaceTimezone || "") !== (initialWorkspaceTimezone || "") ||
    workspaceUseBrowserTimeZone !== initialWorkspaceUseBrowserTimeZone;
  const isWorkspaceDateFormatDirty =
    (workspaceDateFormat || "") !== (initialWorkspaceDateFormat || "") ||
    workspaceUseRelativeDateTime !== initialWorkspaceUseRelativeDateTime;
  const isDefaultRoleDirty = String(defaultRoleCode) !== String(initialDefaultRoleCode);

  return {
    workspaceId,
    t,
    navigate,
    queryClient,
    form,
    assignRoleDialogForm,
    savingKey,
    withSavingKey,
    assignRoleDialogOpen,
    setAssignRoleDialogOpen,
    closeAssignRoleDialog,
    onTabChange,
    detailQuery,
    coreQuery,
    rolesQuery,
    patchWorkspaceMutation,
    patchWorkspaceCoreMutation,
    patchWorkspaceRolePolicyMutation,
    assignWorkspaceRoleMutation,
    disabled,
    initialWorkspaceName,
    persistedWorkspaceName,
    currentWorkspaceName,
    initialWorkspaceDescription,
    persistedWorkspaceDescription,
    currentWorkspaceDescription,
    initialWorkspaceLocale,
    initialWorkspaceTimezone,
    initialWorkspaceUseBrowserTimeZone,
    initialWorkspaceDateFormat,
    initialWorkspaceUseRelativeDateTime,
    initialDefaultRoleCode,
    workspaceLocale,
    workspaceTimezone,
    workspaceUseBrowserTimeZone,
    workspaceDateFormat,
    workspaceUseRelativeDateTime,
    defaultRoleCode,
    assignRoleCode,
    localeOptions,
    timezoneOptions,
    dateFormatOptions,
    dateTimePreferenceOptions,
    roleOptions,
    roleOptionsLength: roleOptions.length,
    roleLabelMap,
    roleDescriptionMap,
    workspaceLocaleLabel,
    workspaceTimezoneLabel,
    workspaceDateFormatLabel,
    defaultRoleLabel,
    assignRoleLabel,
    assignRoleDescription,
    isWorkspaceNameDirty,
    isWorkspaceDescriptionDirty,
    isWorkspaceLocaleDirty,
    isWorkspaceTimezoneDirty,
    isWorkspaceDateFormatDirty,
    isDefaultRoleDirty,
    localePreferenceMode,
    setEffectiveLocale,
    cacheWorkspaceLocale,
  };
}

export type WorkspaceSettingsBasicsController = ReturnType<
  typeof useWorkspaceSettingsBasicsController
>;
