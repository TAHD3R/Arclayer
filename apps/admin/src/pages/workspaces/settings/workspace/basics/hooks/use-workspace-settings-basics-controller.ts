import { Form } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listWorkspaceRoles } from "@/api/rbac";
import { getCoreSettings } from "@/api/settings";
import { getWorkspaceDetail } from "@/api/workspaces";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE } from "@/constants/datetime";
import { useSavingKey } from "@celestial/hooks/use-saving-key";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n";
import {
  resolveLocalizationDateFormatSummary,
  resolveLocalizationTimeZoneSummary,
} from "@/lib/settings/general/datetime-localization";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
} from "@/lib/settings/general/localization-options";
import { pickBool, pickString } from "@/lib/settings/general/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { AssignRoleDialogValues, WorkspaceSettingsFormValues } from "../../types";
import { buildWorkspaceSiteUrl, resolveWorkspaceSettingsTabNavigation } from "../../utils";
import { buildWorkspaceRoleMetadata } from "./role-metadata";
import { useWorkspaceSettingsBasicsMutations } from "./use-workspace-settings-basics-mutations";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function useWorkspaceSettingsBasicsController(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common", "setup"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const cacheWorkspaceLocale = usePreferencesStore((s) => s.cacheWorkspaceLocale);

  const [form] = Form.useForm<WorkspaceSettingsFormValues>();
  const [assignRoleDialogForm] = Form.useForm<AssignRoleDialogValues>();
  const { savingKey, withSavingKey } = useSavingKey();
  const [assignRoleDialogOpen, setAssignRoleDialogOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setCurrentWorkspaceId(workspaceId);
  }, [setCurrentWorkspaceId, workspaceId]);

  const onTabChange = useCallback(
    (next: WorkspaceSettingsTabKey) => {
      void navigate({
        ...resolveWorkspaceSettingsTabNavigation(workspaceId, next),
      });
    },
    [navigate, workspaceId],
  );

  const closeAssignRoleDialog = useCallback(() => {
    assignRoleDialogForm.resetFields();
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

  useEffect(() => {
    if (!detailQuery.data) return;
    const next: Partial<WorkspaceSettingsFormValues> = {};
    if (!form.isFieldTouched("name")) next.name = detailQuery.data.name;
    if (!form.isFieldTouched("slug")) next.slug = detailQuery.data.slug;
    if (!form.isFieldTouched("iconUrl")) next.iconUrl = detailQuery.data.iconUrl ?? "";
    if (Object.keys(next).length > 0) {
      form.setFieldsValue(next);
    }
  }, [detailQuery.data, form]);

  useEffect(() => {
    if (!coreQuery.data) return;
    if (
      form.isFieldTouched("locale") ||
      form.isFieldTouched("timezone") ||
      form.isFieldTouched("dateFormat") ||
      form.isFieldTouched("useBrowserTimeZone") ||
      form.isFieldTouched("useRelativeDateTime")
    ) {
      return;
    }
    const value = coreQuery.data.value;
    form.setFieldsValue({
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
    });
  }, [coreQuery.data, form]);

  useEffect(() => {
    const items = rolesQuery.data?.items ?? [];
    if (!items.length) return;
    const nextRoleCode = items.find((item) => item.isDefault)?.code ?? items[0]?.code;
    if (!nextRoleCode) return;

    if (!form.isFieldTouched("defaultRoleCode")) {
      form.setFieldValue("defaultRoleCode", nextRoleCode);
    }
    if (!form.isFieldTouched("assignRoleCode")) {
      form.setFieldValue("assignRoleCode", nextRoleCode);
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
    (Form.useWatch("name", form) as string | undefined) ?? initialWorkspaceName;

  const initialWorkspaceSlug = detailQuery.data?.slug ?? "";
  const persistedWorkspaceSlug = String(initialWorkspaceSlug || "").trim();
  const currentWorkspaceSlug =
    (Form.useWatch("slug", form) as string | undefined) ?? initialWorkspaceSlug;

  const initialWorkspaceIconUrl = detailQuery.data?.iconUrl ?? "";
  const currentWorkspaceIconUrl =
    (Form.useWatch("iconUrl", form) as string | undefined) ?? initialWorkspaceIconUrl;

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
    (Form.useWatch("locale", form) as string | undefined) ?? String(initialWorkspaceLocale);
  const workspaceTimezone =
    (Form.useWatch("timezone", form) as string | undefined) ?? initialWorkspaceTimezone;
  const workspaceUseBrowserTimeZone =
    (Form.useWatch("useBrowserTimeZone", form) as boolean | undefined) ??
    initialWorkspaceUseBrowserTimeZone;
  const workspaceDateFormat =
    (Form.useWatch("dateFormat", form) as string | undefined) ?? initialWorkspaceDateFormat;
  const workspaceUseRelativeDateTime =
    (Form.useWatch("useRelativeDateTime", form) as boolean | undefined) ??
    initialWorkspaceUseRelativeDateTime;
  const defaultRoleCode =
    (Form.useWatch("defaultRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;
  const assignRoleCode =
    (Form.useWatch("assignRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;

  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const localeOptions = useMemo(() => buildLocaleOptions(t), [t]);
  const timezoneOptions = useMemo(
    () => buildTimezoneOptions(workspaceTimezone || browserTimeZone),
    [browserTimeZone, workspaceTimezone],
  );
  const dateFormatOptions = useMemo(() => buildDateFormatOptions(), []);

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
  });
  const defaultRoleLabel = roleLabelMap.get(String(defaultRoleCode)) ?? String(defaultRoleCode);
  const assignRoleLabel = roleLabelMap.get(String(assignRoleCode)) ?? String(assignRoleCode);
  const assignRoleDescription = roleDescriptionMap.get(String(assignRoleCode)) ?? null;

  const isWorkspaceNameDirty = (currentWorkspaceName || "") !== (initialWorkspaceName || "");
  const isWorkspaceSlugDirty = (currentWorkspaceSlug || "") !== (initialWorkspaceSlug || "");
  const isWorkspaceIconDirty =
    String(currentWorkspaceIconUrl || "").trim() !== String(initialWorkspaceIconUrl || "").trim();
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
    initialWorkspaceSlug,
    persistedWorkspaceSlug,
    currentWorkspaceSlug,
    initialWorkspaceIconUrl,
    currentWorkspaceIconUrl,
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
    isWorkspaceSlugDirty,
    isWorkspaceIconDirty,
    isWorkspaceLocaleDirty,
    isWorkspaceTimezoneDirty,
    isWorkspaceDateFormatDirty,
    isDefaultRoleDirty,
    localePreferenceMode,
    setEffectiveLocale,
    cacheWorkspaceLocale,
    siteUrl: buildWorkspaceSiteUrl(currentWorkspaceSlug),
  };
}

export type WorkspaceSettingsBasicsController = ReturnType<
  typeof useWorkspaceSettingsBasicsController
>;
