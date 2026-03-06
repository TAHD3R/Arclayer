import { Form } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useOrganizationSettingsBasicsController(props: { organizationId: string }) {
  const organizationId = String(props.organizationId || "").trim();
  const tab: OrganizationSettingsTabKey = "basics";
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const [form] = Form.useForm<OrganizationSettingsBasicsFormValues>();
  const [assignRoleDialogForm] = Form.useForm<OrganizationSettingsAssignRoleDialogValues>();
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
    assignRoleDialogForm.resetFields();
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
    if (form.isFieldTouched("name")) return;
    form.setFieldValue("name", nextName);
  }, [coreQuery.data?.organizationName, form, myOrgQuery.data?.organization.name]);

  useEffect(() => {
    if (!coreQuery.data) return;
    if (form.isFieldTouched("logoUrl")) return;
    form.setFieldValue("logoUrl", coreQuery.data.organizationLogoUrl ?? "");
  }, [coreQuery.data, form]);

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
    form.setFieldsValue({
      locale: normalizeLocale(coreQuery.data.organizationLocalization.locale || DEFAULT_LOCALE),
      timezone: coreQuery.data.organizationLocalization.timezone || DEFAULT_TIMEZONE,
      useBrowserTimeZone: coreQuery.data.organizationLocalization.useBrowserTimeZone ?? true,
      dateFormat: coreQuery.data.organizationLocalization.dateFormat || DEFAULT_DATE_FORMAT,
      useRelativeDateTime: coreQuery.data.organizationLocalization.useRelativeDateTime ?? true,
    });
  }, [coreQuery.data, form]);

  useEffect(() => {
    const nextRoleCode = coreQuery.data?.defaultRoleCode;
    if (!nextRoleCode) return;
    if (!form.isFieldTouched("defaultRoleCode")) {
      form.setFieldValue("defaultRoleCode", nextRoleCode);
    }
    if (!form.isFieldTouched("assignRoleCode")) {
      form.setFieldValue("assignRoleCode", nextRoleCode);
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
    onError: (err) => notifyError(err),
  });

  const assignRoleMutation = useMutation({
    mutationFn: async (input: { roleCode: string; confirmName: string }) =>
      assignOrganizationDefaultRoleToAllUsers(input),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey: ["organization", "settings", "core"] });
      await queryClient.invalidateQueries({ queryKey: ["me", "organization"] });
    },
    onError: (err) => notifyError(err),
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
  const currentOrgName = (Form.useWatch("name", form) as string | undefined) ?? initialOrgName;

  const initialOrgLogoUrl = coreQuery.data?.organizationLogoUrl ?? "";
  const currentOrgLogoUrl =
    (Form.useWatch("logoUrl", form) as string | undefined) ?? initialOrgLogoUrl;

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

  const orgLocale = (Form.useWatch("locale", form) as string | undefined) ?? initialOrgLocale;
  const orgTimezone = (Form.useWatch("timezone", form) as string | undefined) ?? initialOrgTimezone;
  const orgUseBrowserTimeZone =
    (Form.useWatch("useBrowserTimeZone", form) as boolean | undefined) ??
    initialOrgUseBrowserTimeZone;
  const orgDateFormat =
    (Form.useWatch("dateFormat", form) as string | undefined) ?? initialOrgDateFormat;
  const orgUseRelativeDateTime =
    (Form.useWatch("useRelativeDateTime", form) as boolean | undefined) ??
    initialOrgUseRelativeDateTime;
  const defaultRoleCode =
    (Form.useWatch("defaultRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;
  const assignRoleCode =
    (Form.useWatch("assignRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;

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
