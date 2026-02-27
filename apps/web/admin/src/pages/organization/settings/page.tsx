import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input, Select } from "antd";
import * as React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  assignOrganizationDefaultRoleToAllUsers,
  deleteOrganization,
  getOrganizationCoreSettings,
  leaveOrganization,
  patchOrganizationCoreSettings,
} from "@/api/organization-settings";
import { listOrganizationRoles } from "@/api/organization-rbac";
import { reinitializeSelfHostSystem } from "@/api/system";
import { getMyOrganization } from "@/api/me";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { SettingAccordionItem } from "@/components/common/setting-accordion-item";
import { SettingActionItem } from "@/components/common/setting-action-item";
import { SettingDialog } from "@/components/common/setting-dialog";
import { SettingPanel } from "@/components/common/setting-panel";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { Accordion } from "@/components/ui/accordion";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { ApiError } from "@/lib/http";
import { type AppLocale, normalizeLocale } from "@/lib/i18n";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
  DEFAULT_DATE_FORMAT,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  resolveDateFormatLabel,
} from "@/lib/settings/general/localization-options";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { DeploymentSettingsTab } from "@/components/common/settings/organization/deployment-settings-tab";

type OrganizationSettingsTabKey = "basics" | "danger" | "deployment";

type FormValues = {
  name: string;
  locale: AppLocale;
  timezone: string;
  dateFormat: string;
  defaultRoleCode: string;
  assignRoleCode: string;
};

type AssignRoleDialogValues = {
  confirmName: string;
};

type LeaveOrganizationDialogValues = {
  confirmText: string;
};

type DeleteOrganizationDialogValues = {
  confirmName: string;
};

type ReinitializeDialogValues = {
  confirmName: string;
};

export function OrganizationSettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtime = useSystemRuntime();
  const clearAuth = useAuthStore((s) => s.clear);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const [form] = Form.useForm<FormValues>();
  const [assignRoleDialogForm] = Form.useForm<AssignRoleDialogValues>();
  const [leaveDialogForm] = Form.useForm<LeaveOrganizationDialogValues>();
  const [deleteDialogForm] = Form.useForm<DeleteOrganizationDialogValues>();
  const [reinitializeDialogForm] = Form.useForm<ReinitializeDialogValues>();
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [assignRoleDialogOpen, setAssignRoleDialogOpen] = React.useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [reinitializeDialogOpen, setReinitializeDialogOpen] = React.useState(false);

  const withSavingKey = React.useCallback(async (key: string, fn: () => Promise<void>) => {
    setSavingKey(key);
    try {
      await fn();
    } finally {
      setSavingKey(null);
    }
  }, []);

  const closeAssignRoleDialog = React.useCallback(() => {
    assignRoleDialogForm.resetFields();
    setAssignRoleDialogOpen(false);
  }, [assignRoleDialogForm]);

  const closeLeaveDialog = React.useCallback(() => {
    leaveDialogForm.resetFields();
    setLeaveDialogOpen(false);
  }, [leaveDialogForm]);

  const closeDeleteDialog = React.useCallback(() => {
    deleteDialogForm.resetFields();
    setDeleteDialogOpen(false);
  }, [deleteDialogForm]);

  const closeReinitializeDialog = React.useCallback(() => {
    reinitializeDialogForm.resetFields();
    setReinitializeDialogOpen(false);
  }, [reinitializeDialogForm]);

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization"],
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

  React.useEffect(() => {
    const nextName = coreQuery.data?.organizationName ?? myOrgQuery.data?.organization.name;
    if (!nextName) return;
    if (form.isFieldTouched("name")) return;
    form.setFieldValue("name", nextName);
  }, [coreQuery.data?.organizationName, form, myOrgQuery.data?.organization.name]);

  React.useEffect(() => {
    if (!coreQuery.data) return;
    if (
      form.isFieldTouched("locale") ||
      form.isFieldTouched("timezone") ||
      form.isFieldTouched("dateFormat")
    ) {
      return;
    }
    form.setFieldsValue({
      locale: normalizeLocale(coreQuery.data.organizationLocalization.locale || DEFAULT_LOCALE),
      timezone: coreQuery.data.organizationLocalization.timezone || DEFAULT_TIMEZONE,
      dateFormat: coreQuery.data.organizationLocalization.dateFormat || DEFAULT_DATE_FORMAT,
    });
  }, [coreQuery.data, form]);

  React.useEffect(() => {
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
      organizationLocalization?: { locale?: string; timezone?: string; dateFormat?: string };
      defaultRoleCode?: string;
    }) => patchOrganizationCoreSettings(patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
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

  const leaveMutation = useMutation({
    mutationFn: async (confirmText: string) => leaveOrganization(confirmText),
    onError: (err) => notifyError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: async (confirmName: string) => deleteOrganization(confirmName),
    onError: (err) => notifyError(err),
  });

  const reinitializeMutation = useMutation({
    mutationFn: async (input: { confirmName: string }) => reinitializeSelfHostSystem(input),
    onError: (err) => notifyError(err),
  });

  const disabled =
    myOrgQuery.isFetching ||
    coreQuery.isFetching ||
    rolesQuery.isFetching ||
    patchCoreMutation.isPending ||
    assignRoleMutation.isPending ||
    leaveMutation.isPending ||
    deleteMutation.isPending ||
    reinitializeMutation.isPending ||
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
  const timezoneOptions = useMemo(() => buildTimezoneOptions(), []);
  const dateFormatOptions = useMemo(() => buildDateFormatOptions(), []);

  const initialOrgName =
    coreQuery.data?.organizationName ?? myOrgQuery.data?.organization.name ?? "";
  const persistedOrgName = String(initialOrgName || "").trim();
  const currentOrgName = (Form.useWatch("name", form) as string | undefined) ?? initialOrgName;

  const initialOrgLocale = normalizeLocale(
    coreQuery.data?.organizationLocalization.locale || DEFAULT_LOCALE,
  ) as AppLocale;
  const initialOrgTimezone = coreQuery.data?.organizationLocalization.timezone || DEFAULT_TIMEZONE;
  const initialOrgDateFormat =
    coreQuery.data?.organizationLocalization.dateFormat || DEFAULT_DATE_FORMAT;
  const initialDefaultRoleCode = coreQuery.data?.defaultRoleCode || "member";

  const orgLocale = (Form.useWatch("locale", form) as AppLocale | undefined) ?? initialOrgLocale;
  const orgTimezone = (Form.useWatch("timezone", form) as string | undefined) ?? initialOrgTimezone;
  const orgDateFormat =
    (Form.useWatch("dateFormat", form) as string | undefined) ?? initialOrgDateFormat;
  const defaultRoleCode =
    (Form.useWatch("defaultRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;
  const assignRoleCode =
    (Form.useWatch("assignRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;

  const orgLocaleLabel =
    localeOptions.find((item) => item.value === orgLocale)?.label ?? String(orgLocale);
  const orgTimezoneLabel =
    timezoneOptions.find((item) => item.value === orgTimezone)?.label ?? String(orgTimezone);
  const orgDateFormatLabel = resolveDateFormatLabel(orgDateFormat);
  const defaultRoleLabel = roleLabelMap.get(defaultRoleCode) ?? defaultRoleCode;
  const assignRoleLabel = roleLabelMap.get(assignRoleCode) ?? assignRoleCode;

  const isOrgNameDirty = String(currentOrgName).trim() !== String(initialOrgName).trim();
  const isOrgLocaleDirty = orgLocale !== initialOrgLocale;
  const isOrgTimezoneDirty = orgTimezone !== initialOrgTimezone;
  const isOrgDateFormatDirty = orgDateFormat !== initialOrgDateFormat;
  const isDefaultRoleDirty = defaultRoleCode !== initialDefaultRoleCode;

  const dialogFieldLabel = React.useCallback((title: string, description: string) => {
    return (
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-label-secondary">{description}</span>
      </div>
    );
  }, []);

  const forbiddenError = useMemo(
    () =>
      new ApiError({
        status: 403,
        message: t("common:PAGE_FORBIDDEN_DESC"),
        error: "ORG_ADMIN_REQUIRED",
      }),
    [t],
  );

  if (myOrgQuery.isLoading && !myOrgQuery.data) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (myOrgQuery.isError) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard
          loading={false}
          error={myOrgQuery.error}
          onRetry={() => void myOrgQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  if (!canManageOrganization) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading={false} error={forbiddenError} hideRetry />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      title={t("settings:SETTINGS_ORG_TITLE")}
      description={t("settings:SETTINGS_ORG_DESC")}
      width="fixed"
    >
      <ContentGuard
        loading={coreQuery.isLoading || rolesQuery.isLoading}
        error={coreQuery.error || rolesQuery.error}
        onRetry={() => {
          void coreQuery.refetch();
          void rolesQuery.refetch();
        }}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={disabled}
          initialValues={{
            name: initialOrgName,
            locale: initialOrgLocale,
            timezone: initialOrgTimezone,
            dateFormat: initialOrgDateFormat,
            defaultRoleCode: initialDefaultRoleCode,
            assignRoleCode: initialDefaultRoleCode,
          }}
        >
          <ChromeTabs defaultValue={"basics" satisfies OrganizationSettingsTabKey}>
            <ChromeTabsList>
              <ChromeTabsTrigger value="basics">
                {t("settings:SETTINGS_WORKSPACE_TAB_BASICS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="danger">
                {t("settings:SETTINGS_ORG_TAB_DANGER")}
              </ChromeTabsTrigger>
              {runtime.deploymentSettingsEnabled ? (
                <ChromeTabsTrigger value="deployment">
                  {t("settings:SETTINGS_ORG_TAB_DEPLOYMENT")}
                </ChromeTabsTrigger>
              ) : null}
            </ChromeTabsList>

            <ChromeTabsContent value="basics">
              <div className="flex flex-col gap-8">
                <SettingPanel
                  title={t("settings:SETTINGS_ORG_BASICS_PANEL_TITLE")}
                  description={t("settings:SETTINGS_ORG_BASICS_PANEL_DESC")}
                >
                  <div className="rounded-lg border border-border">
                    <Accordion type="single" collapsible className="px-0">
                      <SettingAccordionItem
                        value="organization_name"
                        variant="action"
                        title={t("settings:SETTINGS_ORG_NAME_LABEL")}
                        description={t("settings:SETTINGS_ORG_NAME_ITEM_DESC")}
                        showSummary
                        summary={currentOrgName}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !myOrgQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "organization:name"}
                        onConfirm={() =>
                          void withSavingKey("organization:name", async () => {
                            const values = await form.validateFields(["name"]);
                            await patchCoreMutation.mutateAsync({
                              organizationName: String(values.name || "").trim(),
                            });
                          })
                        }
                        onReset={
                          isOrgNameDirty
                            ? () =>
                                void withSavingKey("reset:organization:name", async () => {
                                  form.setFieldValue("name", initialOrgName);
                                  await patchCoreMutation.mutateAsync({
                                    organizationName: String(initialOrgName || "").trim(),
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:organization:name"}
                      >
                        <Form.Item
                          name="name"
                          rules={[
                            {
                              required: true,
                              message: t("settings:SETTINGS_ORG_NAME_REQUIRED"),
                            },
                            { max: 128, message: t("settings:SETTINGS_ORG_NAME_TOO_LONG") },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            size="large"
                            placeholder={t("settings:SETTINGS_ORG_NAME_PLACEHOLDER")}
                          />
                        </Form.Item>
                      </SettingAccordionItem>
                    </Accordion>
                  </div>
                </SettingPanel>

                <SettingPanel
                  title={t("settings:SETTINGS_ORG_LOCALIZATION_PANEL_TITLE")}
                  description={t("settings:SETTINGS_ORG_LOCALIZATION_PANEL_DESC")}
                >
                  <div className="rounded-lg border border-border">
                    <Accordion type="single" collapsible className="px-0">
                      <SettingAccordionItem
                        value="organization_locale"
                        variant="action"
                        title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
                        description={t("settings:SETTINGS_ORG_LANGUAGE_DESC")}
                        showSummary
                        summary={orgLocaleLabel}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !coreQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "organization:locale"}
                        onConfirm={() =>
                          void withSavingKey("organization:locale", async () => {
                            const values = await form.validateFields(["locale"]);
                            const nextLocale = normalizeLocale(values.locale);
                            await patchCoreMutation.mutateAsync({
                              organizationLocalization: { locale: nextLocale },
                            });
                            if (localePreferenceMode === "workspace") {
                              setEffectiveLocale(nextLocale);
                            }
                          })
                        }
                        onReset={
                          isOrgLocaleDirty
                            ? () =>
                                void withSavingKey("reset:organization:locale", async () => {
                                  form.setFieldValue("locale", initialOrgLocale);
                                  await patchCoreMutation.mutateAsync({
                                    organizationLocalization: { locale: initialOrgLocale },
                                  });
                                  if (localePreferenceMode === "workspace") {
                                    setEffectiveLocale(initialOrgLocale);
                                  }
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:organization:locale"}
                      >
                        <Form.Item
                          name="locale"
                          rules={[
                            {
                              required: true,
                              message: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED"),
                            },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select size="large" options={localeOptions} />
                        </Form.Item>
                      </SettingAccordionItem>

                      <SettingAccordionItem
                        value="organization_timezone"
                        variant="action"
                        title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
                        description={t("settings:SETTINGS_ORG_TIMEZONE_DESC")}
                        showSummary
                        summary={orgTimezoneLabel}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !coreQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "organization:timezone"}
                        onConfirm={() =>
                          void withSavingKey("organization:timezone", async () => {
                            const values = await form.validateFields(["timezone"]);
                            await patchCoreMutation.mutateAsync({
                              organizationLocalization: { timezone: String(values.timezone) },
                            });
                          })
                        }
                        onReset={
                          isOrgTimezoneDirty
                            ? () =>
                                void withSavingKey("reset:organization:timezone", async () => {
                                  form.setFieldValue("timezone", initialOrgTimezone);
                                  await patchCoreMutation.mutateAsync({
                                    organizationLocalization: { timezone: initialOrgTimezone },
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:organization:timezone"}
                      >
                        <Form.Item
                          name="timezone"
                          rules={[
                            {
                              required: true,
                              message: t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED"),
                            },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            size="large"
                            options={timezoneOptions}
                            showSearch
                            optionFilterProp="label"
                          />
                        </Form.Item>
                      </SettingAccordionItem>

                      <SettingAccordionItem
                        value="organization_date_format"
                        variant="action"
                        title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
                        description={t("settings:SETTINGS_ORG_DATE_FORMAT_DESC")}
                        showSummary
                        summary={orgDateFormatLabel}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !coreQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "organization:dateFormat"}
                        onConfirm={() =>
                          void withSavingKey("organization:dateFormat", async () => {
                            const values = await form.validateFields(["dateFormat"]);
                            await patchCoreMutation.mutateAsync({
                              organizationLocalization: { dateFormat: String(values.dateFormat) },
                            });
                          })
                        }
                        onReset={
                          isOrgDateFormatDirty
                            ? () =>
                                void withSavingKey("reset:organization:dateFormat", async () => {
                                  form.setFieldValue("dateFormat", initialOrgDateFormat);
                                  await patchCoreMutation.mutateAsync({
                                    organizationLocalization: {
                                      dateFormat: initialOrgDateFormat,
                                    },
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:organization:dateFormat"}
                      >
                        <Form.Item
                          name="dateFormat"
                          rules={[
                            {
                              required: true,
                              message: t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
                            },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select size="large" options={dateFormatOptions} />
                        </Form.Item>
                      </SettingAccordionItem>
                    </Accordion>
                  </div>
                </SettingPanel>

                <SettingPanel
                  title={t("settings:SETTINGS_ORG_ACCESS_PANEL_TITLE")}
                  description={t("settings:SETTINGS_ORG_ACCESS_PANEL_DESC")}
                >
                  <div className="rounded-lg border border-border">
                    <Accordion type="single" collapsible className="px-0">
                      <SettingAccordionItem
                        value="organization_default_role"
                        variant="action"
                        title={t("settings:SETTINGS_ORG_DEFAULT_ROLE_TITLE")}
                        description={t("settings:SETTINGS_ORG_DEFAULT_ROLE_DESC")}
                        showSummary
                        summary={defaultRoleLabel}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !coreQuery.data || roleOptions.length === 0}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "organization:defaultRole"}
                        onConfirm={() =>
                          void withSavingKey("organization:defaultRole", async () => {
                            const values = await form.validateFields(["defaultRoleCode"]);
                            await patchCoreMutation.mutateAsync({
                              defaultRoleCode: String(values.defaultRoleCode),
                            });
                          })
                        }
                        onReset={
                          isDefaultRoleDirty
                            ? () =>
                                void withSavingKey("reset:organization:defaultRole", async () => {
                                  form.setFieldValue("defaultRoleCode", initialDefaultRoleCode);
                                  await patchCoreMutation.mutateAsync({
                                    defaultRoleCode: String(initialDefaultRoleCode),
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:organization:defaultRole"}
                      >
                        <Form.Item
                          name="defaultRoleCode"
                          rules={[
                            {
                              required: true,
                              message: t("settings:SETTINGS_ORG_DEFAULT_ROLE_REQUIRED"),
                            },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            size="large"
                            options={roleOptions}
                            optionFilterProp="label"
                            showSearch
                          />
                        </Form.Item>
                      </SettingAccordionItem>
                      <SettingAccordionItem
                        value="organization_assign_role_to_all"
                        variant="action"
                        title={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_TITLE")}
                        description={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_DESC")}
                        showSummary={false}
                        keepRendered
                        disabled={disabled || !isOwner || roleOptions.length === 0}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Form.Item
                            name="assignRoleCode"
                            rules={[
                              {
                                required: true,
                                message: t("settings:SETTINGS_ORG_DEFAULT_ROLE_REQUIRED"),
                              },
                            ]}
                            style={{ marginBottom: 0 }}
                            className="flex-1"
                          >
                            <Select
                              size="large"
                              options={roleOptions}
                              optionFilterProp="label"
                              showSearch
                            />
                          </Form.Item>

                          <Button
                            type="primary"
                            disabled={disabled || !isOwner || roleOptions.length === 0}
                            onClick={() => {
                              void form
                                .validateFields(["assignRoleCode"])
                                .then(() => {
                                  assignRoleDialogForm.resetFields();
                                  setAssignRoleDialogOpen(true);
                                })
                                .catch(() => undefined);
                            }}
                          >
                            {t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM")}
                          </Button>
                        </div>
                      </SettingAccordionItem>
                    </Accordion>
                  </div>
                </SettingPanel>
              </div>
            </ChromeTabsContent>

            <ChromeTabsContent value="danger">
              <SettingPanel
                title={t("settings:SETTINGS_ORG_DANGER_PANEL_TITLE")}
                description={t("settings:SETTINGS_ORG_DANGER_PANEL_DESC")}
              >
                <div className="divide-y">
                  <SettingActionItem
                    title={t("settings:SETTINGS_ORG_LEAVE_TITLE")}
                    description={t("settings:SETTINGS_ORG_LEAVE_DESC")}
                    showSummary={false}
                    disabled={disabled}
                    onTrigger={() => {
                      leaveDialogForm.resetFields();
                      setLeaveDialogOpen(true);
                    }}
                  />

                  <SettingActionItem
                    title={t("settings:SETTINGS_ORG_DELETE_TITLE")}
                    description={t("settings:SETTINGS_ORG_DELETE_DESC")}
                    showSummary={false}
                    disabled={disabled || !isOwner}
                    onTrigger={() => {
                      deleteDialogForm.resetFields();
                      setDeleteDialogOpen(true);
                    }}
                  />
                </div>
              </SettingPanel>
            </ChromeTabsContent>

            {runtime.deploymentSettingsEnabled ? (
              <ChromeTabsContent value="deployment">
                <div className="flex flex-col gap-8">
                  <DeploymentSettingsTab />

                  {runtime.runtime.deploymentMode === "self_host" ? (
                    <SettingPanel
                      title={t("settings:SETTINGS_ORG_REINITIALIZE_TITLE")}
                      description={t("settings:SETTINGS_ORG_REINITIALIZE_DESC")}
                    >
                      <div className="divide-y">
                        <SettingActionItem
                          title={t("settings:SETTINGS_ORG_REINITIALIZE_TITLE")}
                          description={t("settings:SETTINGS_ORG_REINITIALIZE_DESC")}
                          showSummary={false}
                          disabled={disabled || !isOwner}
                          onTrigger={() => {
                            reinitializeDialogForm.resetFields();
                            setReinitializeDialogOpen(true);
                          }}
                        />
                      </div>
                    </SettingPanel>
                  ) : null}
                </div>
              </ChromeTabsContent>
            ) : null}
          </ChromeTabs>
        </Form>

        <SettingDialog
          open={assignRoleDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeAssignRoleDialog();
          }}
          title={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_TITLE")}
          description={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeAssignRoleDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "organization:assignRoleAll"}
                disabled={disabled || !isOwner || roleOptions.length === 0}
                onClick={() => {
                  void withSavingKey("organization:assignRoleAll", async () => {
                    const roleValues = await form.validateFields(["assignRoleCode"]);
                    const values = await assignRoleDialogForm.validateFields();
                    await assignRoleMutation.mutateAsync({
                      roleCode: String(roleValues.assignRoleCode),
                      confirmName: String(values.confirmName || "").trim(),
                    });
                    closeAssignRoleDialog();
                  });
                }}
              >
                {t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM")}
              </Button>
            </div>
          }
        >
          <Form
            form={assignRoleDialogForm}
            layout="vertical"
            requiredMark={false}
            autoComplete="off"
          >
            <Form.Item
              name="confirmName"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
                t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_DIALOG_CONFIRM_DESC", {
                  role: assignRoleLabel,
                }),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM_NAME_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === persistedOrgName) {
                      return;
                    }
                    throw new Error(
                      t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM_NAME_MISMATCH"),
                    );
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM_NAME_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>

        <SettingDialog
          open={leaveDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeLeaveDialog();
          }}
          title={t("settings:SETTINGS_ORG_LEAVE_TITLE")}
          description={t("settings:SETTINGS_ORG_LEAVE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeLeaveDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "organization:leave"}
                disabled={disabled}
                onClick={() => {
                  void withSavingKey("organization:leave", async () => {
                    const values = await leaveDialogForm.validateFields();
                    await leaveMutation.mutateAsync(String(values.confirmText || "").trim());
                    closeLeaveDialog();
                    clearAuth();
                    clearWorkspace();
                    await navigate({ to: "/login", replace: true });
                  });
                }}
              >
                {t("settings:SETTINGS_ORG_LEAVE_CONFIRM_BUTTON")}
              </Button>
            </div>
          }
        >
          <Form form={leaveDialogForm} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="confirmText"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_TEXT_LABEL"),
                t("settings:SETTINGS_ORG_LEAVE_CONFIRM_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_LEAVE_CONFIRM_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === "LEAVE") {
                      return;
                    }
                    throw new Error(t("settings:SETTINGS_ORG_LEAVE_CONFIRM_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_ORG_LEAVE_CONFIRM_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>

        <SettingDialog
          open={deleteDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeDeleteDialog();
          }}
          title={t("settings:SETTINGS_ORG_DELETE_TITLE")}
          description={t("settings:SETTINGS_ORG_DELETE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeDeleteDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "organization:delete"}
                disabled={disabled || !isOwner}
                onClick={() => {
                  void withSavingKey("organization:delete", async () => {
                    const values = await deleteDialogForm.validateFields();
                    await deleteMutation.mutateAsync(String(values.confirmName || "").trim());
                    closeDeleteDialog();
                    clearAuth();
                    clearWorkspace();
                    await navigate({ to: "/login", replace: true });
                  });
                }}
              >
                {t("common:DELETE")}
              </Button>
            </div>
          }
        >
          <Form form={deleteDialogForm} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="confirmName"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
                t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === persistedOrgName) {
                      return;
                    }
                    throw new Error(t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>

        <SettingDialog
          open={reinitializeDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeReinitializeDialog();
          }}
          title={t("settings:SETTINGS_ORG_REINITIALIZE_TITLE")}
          description={t("settings:SETTINGS_ORG_REINITIALIZE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeReinitializeDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "organization:reinitialize"}
                disabled={disabled || !isOwner}
                onClick={() => {
                  void withSavingKey("organization:reinitialize", async () => {
                    const values = await reinitializeDialogForm.validateFields();
                    await reinitializeMutation.mutateAsync({
                      confirmName: String(values.confirmName || "").trim(),
                    });
                    closeReinitializeDialog();
                    clearAuth();
                    clearWorkspace();
                    await navigate({ to: "/setup", replace: true });
                  });
                }}
              >
                {t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_BUTTON")}
              </Button>
            </div>
          }
        >
          <Form
            form={reinitializeDialogForm}
            layout="vertical"
            requiredMark={false}
            autoComplete="off"
          >
            <Form.Item
              name="confirmName"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
                t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === persistedOrgName) {
                      return;
                    }
                    throw new Error(t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>
      </ContentGuard>
    </DefaultPage>
  );
}
