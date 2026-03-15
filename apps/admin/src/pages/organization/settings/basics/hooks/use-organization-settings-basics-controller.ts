import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import {
  assignOrganizationDefaultRoleToAllUsers,
  getOrganizationCoreSettings,
  patchOrganizationCoreSettings,
} from "@/api/organization-settings";
import { listOrganizationRoles } from "@/api/organization-rbac";
import { useSavingKey } from "@celestial/hooks/use-saving-key";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIMEZONE } from "@/constants/datetime";
import { ApiError } from "@/lib/http";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  resolveLocalizationDateFormatSummary,
  resolveLocalizationTimeZoneSummary,
} from "@/lib/settings/general/datetime-localization";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
} from "@/lib/settings/general/localization-options";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

import type { OrganizationSettingsTabKey } from "../../types";
import { resolveOrganizationSettingsTabNavigation } from "../../utils";

export type OrganizationSettingsBasicsFormValues = {
  name: string;
  logoUrl: string;
  locale: string;
  timezone: string;
  useBrowserTimeZone: boolean;
  dateFormat: string;
  useRelativeDateTime: boolean;
  defaultRoleCode: string;
  assignRoleCode: string;
};

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export type OrganizationSettingsAssignRoleDialogValues = {
  confirmName: string;
};

const DEFAULT_FORM_VALUES: OrganizationSettingsBasicsFormValues = {
  name: "",
  logoUrl: "",
  locale: DEFAULT_LOCALE,
  timezone: DEFAULT_TIMEZONE,
  useBrowserTimeZone: true,
  dateFormat: DEFAULT_DATE_FORMAT,
  useRelativeDateTime: true,
  defaultRoleCode: "",
  assignRoleCode: "",
};

export function useOrganizationSettingsBasicsController(props: { organizationId: string }) {
  const organizationId = String(props.organizationId || "").trim();
  const tab: OrganizationSettingsTabKey = "basics";
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const localePreferenceMode = usePreferencesStore((state) => state.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((state) => state.setEffectiveLocale);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const form = useForm<OrganizationSettingsBasicsFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
  });
  const assignRoleDialogForm = useForm<OrganizationSettingsAssignRoleDialogValues>({
    defaultValues: { confirmName: "" },
  });
  const { savingKey, withSavingKey } = useSavingKey();
  const [assignRoleDialogOpen, setAssignRoleDialogOpen] = useState(false);

  const onTabChange = useCallback(
    (next: OrganizationSettingsTabKey) => {
      void navigate({
        ...resolveOrganizationSettingsTabNavigation(organizationId, next),
      });
    },
    [navigate, organizationId],
  );

  const closeAssignRoleDialog = useCallback(() => {
    assignRoleDialogForm.reset();
    setAssignRoleDialogOpen(false);
  }, [assignRoleDialogForm]);

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization", sessionVersion],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const isOwner = myOrgQuery.data?.membership?.role === "owner";
  const canManageOrganization =
    myOrgQuery.data?.membership?.role === "owner" || myOrgQuery.data?.membership?.role === "admin";

  const coreQuery = useQuery({
    queryKey: ["organization", "settings", "core"],
    enabled: canManageOrganization,
    queryFn: async () => getOrganizationCoreSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const rolesQuery = useQuery({
    queryKey: ["organization", "rbac", "roles", "all"],
    enabled: canManageOrganization,
    queryFn: async () => listOrganizationRoles({ page: 1, size: 200 }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  useEffect(() => {
    const nextName = coreQuery.data?.organizationName ?? myOrgQuery.data?.organization.name;
    if (!nextName) return;
    if (!form.getFieldState("name").isDirty) {
      form.setValue("name", nextName, { shouldDirty: false });
    }
  }, [coreQuery.data?.organizationName, form, myOrgQuery.data?.organization.name]);

  useEffect(() => {
    if (!coreQuery.data) return;
    if (!form.getFieldState("logoUrl").isDirty) {
      form.setValue("logoUrl", coreQuery.data.organizationLogoUrl ?? "", { shouldDirty: false });
    }
  }, [coreQuery.data, form]);

  useEffect(() => {
    if (!coreQuery.data) return;
    const nextValues = {
      locale: normalizeLocale(coreQuery.data.organizationLocalization.locale || DEFAULT_LOCALE),
      timezone: coreQuery.data.organizationLocalization.timezone || DEFAULT_TIMEZONE,
      useBrowserTimeZone: coreQuery.data.organizationLocalization.useBrowserTimeZone ?? true,
      dateFormat: coreQuery.data.organizationLocalization.dateFormat || DEFAULT_DATE_FORMAT,
      useRelativeDateTime: coreQuery.data.organizationLocalization.useRelativeDateTime ?? true,
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
    const nextRoleCode = coreQuery.data?.defaultRoleCode;
    if (!nextRoleCode) return;
    if (!form.getFieldState("defaultRoleCode").isDirty) {
      form.setValue("defaultRoleCode", nextRoleCode, { shouldDirty: false });
    }
    if (!form.getFieldState("assignRoleCode").isDirty) {
      form.setValue("assignRoleCode", nextRoleCode, { shouldDirty: false });
    }
  }, [coreQuery.data?.defaultRoleCode, form]);

  const patchCoreMutation = useMutation({
    mutationFn: async (patch: {
      organizationName?: string;
      organizationLogoUrl?: string | null;
      organizationLocalization?: {
        locale?: string;
        timezone?: string;
        dateFormat?: string;
        useBrowserTimeZone?: boolean;
        useRelativeDateTime?: boolean;
      };
      defaultRoleCode?: string;
    }) => patchOrganizationCoreSettings(patch),
    onSuccess: async (data) => {
      const aligned = Boolean(data?.organizationLogoAssetAligned);
      notifySuccessText(
        aligned ? t("settings:SETTINGS_SAVED_ASSET_ALIGNED") : t("settings:SETTINGS_SAVED"),
      );
      await queryClient.invalidateQueries({ queryKey: ["organization", "settings", "core"] });
      await queryClient.invalidateQueries({ queryKey: ["me", "organization"] });
    },
    onError: (error) => notifyError(error),
  });

  const assignRoleMutation = useMutation({
    mutationFn: async (input: { roleCode: string; confirmName: string }) =>
      assignOrganizationDefaultRoleToAllUsers(input),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey: ["organization", "settings", "core"] });
      await queryClient.invalidateQueries({ queryKey: ["me", "organization"] });
    },
    onError: (error) => notifyError(error),
  });

  const disabled =
    myOrgQuery.isFetching ||
    coreQuery.isFetching ||
    rolesQuery.isFetching ||
    patchCoreMutation.isPending ||
    assignRoleMutation.isPending ||
    Boolean(savingKey);

  const roleItems = rolesQuery.data?.items ?? [];
  const roleOptions = useMemo(
    () => roleItems.map((item) => ({ label: item.name, value: item.code })),
    [roleItems],
  );
  const roleLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of roleItems) {
      map.set(String(item.code), String(item.name));
    }
    return map;
  }, [roleItems]);

  const localeOptions = useMemo(() => buildLocaleOptions(t), [t]);
  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const timezoneOptions = useMemo(() => buildTimezoneOptions(browserTimeZone), [browserTimeZone]);
  const dateFormatOptions = useMemo(() => buildDateFormatOptions(), []);

  const initialOrgName =
    coreQuery.data?.organizationName ?? myOrgQuery.data?.organization.name ?? "";
  const persistedOrgName = String(initialOrgName || "").trim();
  const currentOrgName = useWatch({ control: form.control, name: "name" }) ?? initialOrgName;

  const initialOrgLogoUrl = coreQuery.data?.organizationLogoUrl ?? "";
  const currentOrgLogoUrl =
    useWatch({ control: form.control, name: "logoUrl" }) ?? initialOrgLogoUrl;

  const initialOrgLocale = normalizeLocale(
    coreQuery.data?.organizationLocalization.locale || DEFAULT_LOCALE,
  );
  const initialOrgTimezone = coreQuery.data?.organizationLocalization.timezone || DEFAULT_TIMEZONE;
  const initialOrgUseBrowserTimeZone =
    coreQuery.data?.organizationLocalization.useBrowserTimeZone ?? true;
  const initialOrgDateFormat =
    coreQuery.data?.organizationLocalization.dateFormat || DEFAULT_DATE_FORMAT;
  const initialOrgUseRelativeDateTime =
    coreQuery.data?.organizationLocalization.useRelativeDateTime ?? true;
  const initialDefaultRoleCode = coreQuery.data?.defaultRoleCode || roleItems[0]?.code || "";

  const orgLocale = useWatch({ control: form.control, name: "locale" }) ?? initialOrgLocale;
  const orgTimezone = useWatch({ control: form.control, name: "timezone" }) ?? initialOrgTimezone;
  const orgUseBrowserTimeZone =
    useWatch({ control: form.control, name: "useBrowserTimeZone" }) ?? initialOrgUseBrowserTimeZone;
  const orgDateFormat =
    useWatch({ control: form.control, name: "dateFormat" }) ?? initialOrgDateFormat;
  const orgUseRelativeDateTime =
    useWatch({ control: form.control, name: "useRelativeDateTime" }) ??
    initialOrgUseRelativeDateTime;
  const defaultRoleCode =
    useWatch({ control: form.control, name: "defaultRoleCode" }) ?? initialDefaultRoleCode;
  const assignRoleCode =
    useWatch({ control: form.control, name: "assignRoleCode" }) ?? initialDefaultRoleCode;

  const orgLocaleLabel =
    localeOptions.find((item) => item.value === orgLocale)?.label ?? String(orgLocale);
  const orgTimezoneLabel = resolveLocalizationTimeZoneSummary({
    timeZone: orgTimezone,
    browserTimeZone,
    useBrowserTimeZone: orgUseBrowserTimeZone,
    autoLabel: t("settings:SETTINGS_TIMEZONE_AUTO_SHORT"),
  });
  const orgDateFormatLabel = resolveLocalizationDateFormatSummary({
    dateFormat: String(orgDateFormat),
    useRelativeDateTime: orgUseRelativeDateTime,
    relativeLabel: t("settings:SETTINGS_DATETIME_RELATIVE_SHORT"),
  });
  const defaultRoleLabel = roleLabelMap.get(String(defaultRoleCode)) ?? String(defaultRoleCode);
  const assignRoleLabel = roleLabelMap.get(String(assignRoleCode)) ?? String(assignRoleCode);

  const isOrgNameDirty = String(currentOrgName).trim() !== String(initialOrgName).trim();
  const isOrgLogoDirty = String(currentOrgLogoUrl).trim() !== String(initialOrgLogoUrl).trim();
  const isOrgLocaleDirty = orgLocale !== initialOrgLocale;
  const isOrgTimezoneDirty =
    orgTimezone !== initialOrgTimezone || orgUseBrowserTimeZone !== initialOrgUseBrowserTimeZone;
  const isOrgDateFormatDirty =
    orgDateFormat !== initialOrgDateFormat ||
    orgUseRelativeDateTime !== initialOrgUseRelativeDateTime;
  const isDefaultRoleDirty = defaultRoleCode !== initialDefaultRoleCode;

  const forbiddenError = useMemo(
    () =>
      new ApiError({
        status: 403,
        message: t("common:PAGE_FORBIDDEN_DESC"),
        error: "ORG_ADMIN_REQUIRED",
      }),
    [t],
  );

  return {
    organizationId,
    tab,
    t,
    form,
    assignRoleDialogForm,
    savingKey,
    withSavingKey,
    assignRoleDialogOpen,
    setAssignRoleDialogOpen,
    closeAssignRoleDialog,
    onTabChange,
    myOrgQuery,
    coreQuery,
    rolesQuery,
    isOwner,
    canManageOrganization,
    forbiddenError,
    patchCoreMutation,
    assignRoleMutation,
    disabled,
    localeOptions,
    timezoneOptions,
    dateFormatOptions,
    roleOptions,
    roleLabelMap,
    persistedOrgName,
    initialOrgName,
    currentOrgName,
    initialOrgLogoUrl,
    currentOrgLogoUrl,
    initialOrgLocale,
    initialOrgTimezone,
    initialOrgUseBrowserTimeZone,
    initialOrgDateFormat,
    initialOrgUseRelativeDateTime,
    initialDefaultRoleCode,
    orgLocale,
    orgTimezone,
    orgUseBrowserTimeZone,
    orgDateFormat,
    orgUseRelativeDateTime,
    defaultRoleCode,
    assignRoleCode,
    orgLocaleLabel,
    orgTimezoneLabel,
    orgDateFormatLabel,
    defaultRoleLabel,
    assignRoleLabel,
    isOrgNameDirty,
    isOrgLogoDirty,
    isOrgLocaleDirty,
    isOrgTimezoneDirty,
    isOrgDateFormatDirty,
    isDefaultRoleDirty,
    localePreferenceMode,
    setEffectiveLocale,
  };
}

export type OrganizationSettingsBasicsController = ReturnType<
  typeof useOrganizationSettingsBasicsController
>;
