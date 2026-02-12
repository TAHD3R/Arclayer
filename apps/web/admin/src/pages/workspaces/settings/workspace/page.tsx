import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input, Select } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import { listWorkspaceRoles } from "@/api/rbac";
import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import {
  assignWorkspaceRoleToAllUsers,
  deleteWorkspace,
  getWorkspaceDetail,
  leaveWorkspace,
  listMyWorkspaces,
  patchWorkspaceRolePolicy,
  patchWorkspaceDetail,
} from "@/api/workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { Accordion } from "@/components/ui/accordion";
import { SettingActionItem } from "@/components/common/setting-action-item";
import { SettingAccordionItem } from "@/components/common/setting-accordion-item";
import { SettingDialog } from "@/components/common/setting-dialog";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { SettingPanel } from "@/components/common/setting-panel";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  buildDateFormatOptions,
  buildLocaleOptions,
  buildTimezoneOptions,
  DEFAULT_DATE_FORMAT,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  resolveDateFormatLabel,
} from "@/lib/settings/general/localization-options";
import { pickString } from "@/lib/settings/general/utils";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { AppLocale } from "@/lib/i18n";
import { normalizeLocale } from "@/lib/i18n";
import { buildOrganizationPath } from "@/lib/organization-routing";

type WorkspaceSettingsTabKey =
  | "basics"
  | "collaboration"
  | "content_strategy"
  | "integrations"
  | "resource_processing"
  | "danger";

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

type LeaveWorkspaceDialogValues = {
  confirmText: string;
};

type DeleteWorkspaceDialogValues = {
  confirmName: string;
};

export function WorkspaceSettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [assignRoleDialogForm] = Form.useForm<AssignRoleDialogValues>();
  const [leaveDialogForm] = Form.useForm<LeaveWorkspaceDialogValues>();
  const [deleteDialogForm] = Form.useForm<DeleteWorkspaceDialogValues>();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const localePreference = usePreferencesStore((s) => s.localePreference);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const cacheWorkspaceLocale = usePreferencesStore((s) => s.cacheWorkspaceLocale);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [assignRoleDialogOpen, setAssignRoleDialogOpen] = React.useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

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

  const detailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceDetail(String(workspaceId)),
    retry: false,
    meta: { silent: true },
  });

  const coreQuery = useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization"],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const rolesQuery = useQuery({
    queryKey: ["workspace", "rbac", "roles", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceRoles(String(workspaceId), { page: 1, size: 200 }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  React.useEffect(() => {
    if (!detailQuery.data) return;
    if (form.isFieldTouched("name")) return;
    form.setFieldsValue({
      name: detailQuery.data.name,
    });
  }, [detailQuery.data, form]);

  React.useEffect(() => {
    if (!coreQuery.data) return;
    if (
      form.isFieldTouched("locale") ||
      form.isFieldTouched("timezone") ||
      form.isFieldTouched("dateFormat")
    ) {
      return;
    }
    const value = coreQuery.data.value;
    form.setFieldsValue({
      locale: normalizeLocale(
        pickString(value, ["workspace_localization", "locale"]) ?? DEFAULT_LOCALE,
      ),
      timezone: pickString(value, ["workspace_localization", "timezone"]) ?? DEFAULT_TIMEZONE,
      dateFormat:
        pickString(value, ["workspace_localization", "date_format"]) ?? DEFAULT_DATE_FORMAT,
    });
  }, [coreQuery.data, form]);

  React.useEffect(() => {
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

  const patchWorkspaceMutation = useMutation({
    mutationFn: async (patch: { name?: string }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchWorkspaceDetail(String(workspaceId), patch);
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["workspace", "detail", workspaceId] });
      // Workspace selector + other places rely on this list.
      await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
    },
    onError: (err) => notifyError(err),
  });

  const patchWorkspaceCoreMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchCoreSettings(String(workspaceId), patch);
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "core", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const patchWorkspaceRolePolicyMutation = useMutation({
    mutationFn: async (input: { defaultRoleCode: string }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchWorkspaceRolePolicy(String(workspaceId), input);
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "rbac", "roles", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const assignWorkspaceRoleMutation = useMutation({
    mutationFn: async (input: { roleCode: string; confirmName: string }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return assignWorkspaceRoleToAllUsers(String(workspaceId), input);
    },
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "rbac", "roles", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const leaveWorkspaceMutation = useMutation({
    mutationFn: async (confirmText: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return leaveWorkspace(String(workspaceId), confirmText);
    },
    onError: (err) => notifyError(err),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (confirmName: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return deleteWorkspace(String(workspaceId), confirmName);
    },
    onError: (err) => notifyError(err),
  });

  const disabled =
    detailQuery.isFetching ||
    coreQuery.isFetching ||
    myOrgQuery.isFetching ||
    rolesQuery.isFetching ||
    patchWorkspaceMutation.isPending ||
    patchWorkspaceCoreMutation.isPending ||
    patchWorkspaceRolePolicyMutation.isPending ||
    assignWorkspaceRoleMutation.isPending ||
    leaveWorkspaceMutation.isPending ||
    deleteWorkspaceMutation.isPending ||
    Boolean(savingKey);

  const initialWorkspaceName = detailQuery.data?.name ?? "";
  const persistedWorkspaceName = String(initialWorkspaceName || "").trim();
  const currentWorkspaceName =
    (Form.useWatch("name", form) as string | undefined) ?? initialWorkspaceName;

  const initialWorkspaceLocale = normalizeLocale(
    pickString(coreQuery.data?.value, ["workspace_localization", "locale"]) ?? DEFAULT_LOCALE,
  ) as AppLocale;
  const initialWorkspaceTimezone =
    pickString(coreQuery.data?.value, ["workspace_localization", "timezone"]) ?? DEFAULT_TIMEZONE;
  const initialWorkspaceDateFormat =
    pickString(coreQuery.data?.value, ["workspace_localization", "date_format"]) ??
    DEFAULT_DATE_FORMAT;
  const roleItems = rolesQuery.data?.items ?? [];
  const initialDefaultRoleCode =
    roleItems.find((item) => item.isDefault)?.code ?? roleItems[0]?.code ?? "viewer";

  const workspaceLocale =
    (Form.useWatch("locale", form) as AppLocale | undefined) ?? initialWorkspaceLocale;
  const workspaceTimezone =
    (Form.useWatch("timezone", form) as string | undefined) ?? initialWorkspaceTimezone;
  const workspaceDateFormat =
    (Form.useWatch("dateFormat", form) as string | undefined) ?? initialWorkspaceDateFormat;
  const defaultRoleCode =
    (Form.useWatch("defaultRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;
  const assignRoleCode =
    (Form.useWatch("assignRoleCode", form) as string | undefined) ?? initialDefaultRoleCode;

  const localeOptions = React.useMemo(() => buildLocaleOptions(t), [t]);
  const timezoneOptions = React.useMemo(
    () => buildTimezoneOptions(workspaceTimezone),
    [workspaceTimezone],
  );
  const dateFormatOptions = React.useMemo(() => buildDateFormatOptions(), []);

  const roleOptions = React.useMemo(
    () => roleItems.map((item) => ({ label: item.name, value: item.code })),
    [roleItems],
  );
  const roleLabelMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const role of roleItems) {
      map.set(String(role.code), String(role.name));
    }
    return map;
  }, [roleItems]);

  const workspaceLocaleLabel =
    localeOptions.find((item) => item.value === workspaceLocale)?.label ?? workspaceLocale;
  const workspaceDateFormatLabel = resolveDateFormatLabel(workspaceDateFormat);
  const defaultRoleLabel = roleLabelMap.get(defaultRoleCode) ?? defaultRoleCode;
  const assignRoleLabel = roleLabelMap.get(assignRoleCode) ?? assignRoleCode;

  const isWorkspaceNameDirty = (currentWorkspaceName || "") !== (initialWorkspaceName || "");
  const isWorkspaceLocaleDirty = (workspaceLocale || "") !== (initialWorkspaceLocale || "");
  const isWorkspaceTimezoneDirty = (workspaceTimezone || "") !== (initialWorkspaceTimezone || "");
  const isWorkspaceDateFormatDirty =
    (workspaceDateFormat || "") !== (initialWorkspaceDateFormat || "");
  const isDefaultRoleDirty = defaultRoleCode !== initialDefaultRoleCode;
  const isOrgOwner = myOrgQuery.data?.membership.role === "owner";

  const dialogFieldLabel = React.useCallback((title: string, description: string) => {
    return (
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-muted-foreground">{description}</span>
      </div>
    );
  }, []);

  const navigateAfterWorkspaceRemoved = React.useCallback(async () => {
    const next = await listMyWorkspaces();
    const nextWorkspace =
      next.items.find((item) => item.workspaceId !== workspaceId) ?? next.items[0];

    if (nextWorkspace) {
      setCurrentWorkspaceId(nextWorkspace.workspaceId);
      await navigate({ to: `/w/${nextWorkspace.workspaceId}/settings/workspace`, replace: true });
      return;
    }

    setCurrentWorkspaceId(null);
    const orgId = String(myOrgQuery.data?.organization.id || "").trim();
    if (orgId) {
      await navigate({ to: buildOrganizationPath(orgId, "/settings/organization"), replace: true });
      return;
    }

    await navigate({ to: "/", replace: true });
  }, [myOrgQuery.data?.organization.id, navigate, setCurrentWorkspaceId, workspaceId]);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <PageState
        loading={Boolean(
          workspaceId && (detailQuery.isLoading || rolesQuery.isLoading) && !detailQuery.data,
        )}
        loadingVariant="form"
        empty={!workspaceId}
        emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
        emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
        error={
          detailQuery.isError
            ? detailQuery.error
            : coreQuery.isError
              ? coreQuery.error
              : rolesQuery.isError
                ? rolesQuery.error
                : myOrgQuery.isError
                  ? myOrgQuery.error
                  : null
        }
        onRetry={() => {
          void detailQuery.refetch();
          void coreQuery.refetch();
          void rolesQuery.refetch();
          void myOrgQuery.refetch();
        }}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={disabled}
          initialValues={{
            name: detailQuery.data?.name ?? "",
            locale: normalizeLocale(
              pickString(coreQuery.data?.value, ["workspace_localization", "locale"]) ??
                DEFAULT_LOCALE,
            ),
            timezone:
              pickString(coreQuery.data?.value, ["workspace_localization", "timezone"]) ??
              DEFAULT_TIMEZONE,
            dateFormat:
              pickString(coreQuery.data?.value, ["workspace_localization", "date_format"]) ??
              DEFAULT_DATE_FORMAT,
            defaultRoleCode: initialDefaultRoleCode,
            assignRoleCode: initialDefaultRoleCode,
          }}
        >
          <ChromeTabs defaultValue={"basics" satisfies WorkspaceSettingsTabKey}>
            <ChromeTabsList>
              <ChromeTabsTrigger value="basics">
                {t("settings:SETTINGS_WORKSPACE_TAB_BASICS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="collaboration">
                {t("settings:SETTINGS_WORKSPACE_TAB_COLLABORATION")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="content_strategy">
                {t("settings:SETTINGS_WORKSPACE_TAB_CONTENT_STRATEGY")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="integrations">
                {t("settings:SETTINGS_WORKSPACE_TAB_INTEGRATIONS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="resource_processing">
                {t("settings:SETTINGS_WORKSPACE_TAB_RESOURCE_PROCESSING")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="danger">
                {t("settings:SETTINGS_WORKSPACE_TAB_DANGER")}
              </ChromeTabsTrigger>
            </ChromeTabsList>

            <ChromeTabsContent value="basics">
              <div className="flex flex-col gap-8">
                <SettingPanel
                  title={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_TITLE")}
                  description={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_DESC")}
                >
                  <div className="rounded-lg border border-border">
                    <Accordion type="single" collapsible className="px-0">
                      <SettingAccordionItem
                        value="workspace_name"
                        variant="action"
                        title={t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
                        description={t("settings:SETTINGS_WORKSPACE_NAME_ITEM_DESC")}
                        showSummary
                        summary={currentWorkspaceName}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !detailQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "workspace:name"}
                        onConfirm={() =>
                          void withSavingKey("workspace:name", async () => {
                            const values = await form.validateFields(["name"]);
                            await patchWorkspaceMutation.mutateAsync({
                              name: String(values.name || "").trim(),
                            });
                          })
                        }
                        onReset={
                          isWorkspaceNameDirty && detailQuery.data
                            ? () =>
                                void withSavingKey("reset:workspace:name", async () => {
                                  form.setFieldValue("name", initialWorkspaceName);
                                  await patchWorkspaceMutation.mutateAsync({
                                    name: String(initialWorkspaceName || "").trim(),
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:workspace:name"}
                      >
                        <Form.Item
                          name="name"
                          rules={[
                            {
                              required: true,
                              message: t("settings:SETTINGS_WORKSPACE_NAME_REQUIRED"),
                            },
                            { max: 128, message: t("settings:SETTINGS_WORKSPACE_NAME_TOO_LONG") },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            size="large"
                            placeholder={t("settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER")}
                          />
                        </Form.Item>
                      </SettingAccordionItem>
                    </Accordion>
                  </div>
                </SettingPanel>

                <SettingPanel
                  title={t("settings:SETTINGS_WORKSPACE_LOCALIZATION_PANEL_TITLE")}
                  description={t("settings:SETTINGS_WORKSPACE_LOCALIZATION_PANEL_DESC")}
                >
                  <div className="rounded-lg border border-border">
                    <Accordion type="single" collapsible className="px-0">
                      <SettingAccordionItem
                        value="workspace_locale"
                        variant="action"
                        title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
                        description={t("settings:SETTINGS_WORKSPACE_LANGUAGE_DESC")}
                        showSummary
                        summary={workspaceLocaleLabel}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !coreQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "workspace:locale"}
                        onConfirm={() =>
                          void withSavingKey("workspace:locale", async () => {
                            const values = await form.validateFields(["locale"]);
                            const nextLocale = normalizeLocale(values.locale);
                            await patchWorkspaceCoreMutation.mutateAsync({
                              workspace_localization: { locale: nextLocale },
                            });
                            if (workspaceId) {
                              await queryClient.invalidateQueries({
                                queryKey: ["workspace", "adminMenu", workspaceId],
                              });
                              cacheWorkspaceLocale(String(workspaceId), nextLocale);
                            }
                            // Workspace default locale is only applied when user has no explicit preference.
                            if (!localePreference) {
                              setEffectiveLocale(nextLocale);
                            }
                          })
                        }
                        onReset={
                          isWorkspaceLocaleDirty && coreQuery.data
                            ? () =>
                                void withSavingKey("reset:workspace:locale", async () => {
                                  form.setFieldValue("locale", initialWorkspaceLocale);
                                  await patchWorkspaceCoreMutation.mutateAsync({
                                    workspace_localization: {
                                      locale: initialWorkspaceLocale,
                                    },
                                  });
                                  if (workspaceId) {
                                    await queryClient.invalidateQueries({
                                      queryKey: ["workspace", "adminMenu", workspaceId],
                                    });
                                    cacheWorkspaceLocale(
                                      String(workspaceId),
                                      initialWorkspaceLocale,
                                    );
                                  }
                                  if (!localePreference) {
                                    setEffectiveLocale(initialWorkspaceLocale);
                                  }
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:workspace:locale"}
                      >
                        <div className="text-muted-foreground mb-4">
                          {t("settings:SETTINGS_WORKSPACE_LOCALIZATION_NOTE", {
                            locale: workspaceLocaleLabel ?? "-",
                          })}
                        </div>
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
                        value="workspace_timezone"
                        variant="action"
                        title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
                        description={t("settings:SETTINGS_WORKSPACE_TIMEZONE_DESC")}
                        showSummary
                        summary={workspaceTimezone}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !coreQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "workspace:timezone"}
                        onConfirm={() =>
                          void withSavingKey("workspace:timezone", async () => {
                            const values = await form.validateFields(["timezone"]);
                            await patchWorkspaceCoreMutation.mutateAsync({
                              workspace_localization: { timezone: String(values.timezone) },
                            });
                          })
                        }
                        onReset={
                          isWorkspaceTimezoneDirty && coreQuery.data
                            ? () =>
                                void withSavingKey("reset:workspace:timezone", async () => {
                                  form.setFieldValue("timezone", initialWorkspaceTimezone);
                                  await patchWorkspaceCoreMutation.mutateAsync({
                                    workspace_localization: { timezone: initialWorkspaceTimezone },
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:workspace:timezone"}
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
                        value="workspace_date_format"
                        variant="action"
                        title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
                        description={t("settings:SETTINGS_WORKSPACE_DATE_FORMAT_DESC")}
                        showSummary
                        summary={workspaceDateFormatLabel}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !coreQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "workspace:dateFormat"}
                        onConfirm={() =>
                          void withSavingKey("workspace:dateFormat", async () => {
                            const values = await form.validateFields(["dateFormat"]);
                            await patchWorkspaceCoreMutation.mutateAsync({
                              workspace_localization: { date_format: String(values.dateFormat) },
                            });
                          })
                        }
                        onReset={
                          isWorkspaceDateFormatDirty && coreQuery.data
                            ? () =>
                                void withSavingKey("reset:workspace:dateFormat", async () => {
                                  form.setFieldValue("dateFormat", initialWorkspaceDateFormat);
                                  await patchWorkspaceCoreMutation.mutateAsync({
                                    workspace_localization: {
                                      date_format: initialWorkspaceDateFormat,
                                    },
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:workspace:dateFormat"}
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
                  title={t("settings:SETTINGS_WORKSPACE_ACCESS_PANEL_TITLE")}
                  description={t("settings:SETTINGS_WORKSPACE_ACCESS_PANEL_DESC")}
                >
                  <div className="rounded-lg border border-border">
                    <Accordion type="single" collapsible className="px-0">
                      <SettingAccordionItem
                        value="workspace_default_role"
                        variant="action"
                        title={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_TITLE")}
                        description={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_DESC")}
                        showSummary
                        summary={defaultRoleLabel}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || roleOptions.length === 0}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "workspace:defaultRole"}
                        onConfirm={() =>
                          void withSavingKey("workspace:defaultRole", async () => {
                            const values = await form.validateFields(["defaultRoleCode"]);
                            await patchWorkspaceRolePolicyMutation.mutateAsync({
                              defaultRoleCode: String(values.defaultRoleCode),
                            });
                          })
                        }
                        onReset={
                          isDefaultRoleDirty
                            ? () =>
                                void withSavingKey("reset:workspace:defaultRole", async () => {
                                  form.setFieldValue("defaultRoleCode", initialDefaultRoleCode);
                                  await patchWorkspaceRolePolicyMutation.mutateAsync({
                                    defaultRoleCode: String(initialDefaultRoleCode),
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:workspace:defaultRole"}
                      >
                        <Form.Item
                          name="defaultRoleCode"
                          rules={[
                            {
                              required: true,
                              message: t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_REQUIRED"),
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
                        value="workspace_assign_role_to_all"
                        variant="action"
                        title={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_TITLE")}
                        description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
                        showSummary={false}
                        keepRendered
                        disabled={disabled || roleOptions.length === 0}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Form.Item
                            name="assignRoleCode"
                            rules={[
                              {
                                required: true,
                                message: t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_REQUIRED"),
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
                            disabled={disabled || roleOptions.length === 0}
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
                            {t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM")}
                          </Button>
                        </div>
                      </SettingAccordionItem>
                    </Accordion>
                  </div>
                </SettingPanel>
              </div>
            </ChromeTabsContent>

            <ChromeTabsContent value="collaboration">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_COLLABORATION")}
                description={t("settings:SETTINGS_WORKSPACE_COLLABORATION_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_COLLAB_EDIT_LOCK_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_COLLAB_EDIT_LOCK_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_COLLAB_APPROVAL_FLOW_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_COLLAB_APPROVAL_FLOW_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="content_strategy">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_CONTENT_STRATEGY")}
                description={t("settings:SETTINGS_WORKSPACE_CONTENT_STRATEGY_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="integrations">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_INTEGRATIONS")}
                description={t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_WEBHOOKS_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_WEBHOOKS_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_PREVIEW_URL_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_PREVIEW_URL_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="resource_processing">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_RESOURCE_PROCESSING")}
                description={t("settings:SETTINGS_WORKSPACE_RESOURCE_PROCESSING_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_RESOURCE_IMAGE_PROCESSING_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_RESOURCE_IMAGE_PROCESSING_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_RESOURCE_CDN_PREFIX_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_RESOURCE_CDN_PREFIX_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="danger">
              <SettingPanel
                title={t("settings:SETTINGS_WORKSPACE_DANGER_PANEL_TITLE")}
                description={t("settings:SETTINGS_WORKSPACE_DANGER_PANEL_DESC")}
              >
                <div className="divide-y">
                  <SettingActionItem
                    title={t("settings:SETTINGS_WORKSPACE_LEAVE_TITLE")}
                    description={t("settings:SETTINGS_WORKSPACE_LEAVE_DESC")}
                    showSummary={false}
                    disabled={disabled}
                    onTrigger={() => {
                      leaveDialogForm.resetFields();
                      setLeaveDialogOpen(true);
                    }}
                  />

                  <SettingActionItem
                    title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
                    description={t("settings:SETTINGS_WORKSPACE_DELETE_DESC")}
                    showSummary={false}
                    disabled={disabled || !isOrgOwner}
                    onTrigger={() => {
                      deleteDialogForm.resetFields();
                      setDeleteDialogOpen(true);
                    }}
                  />
                </div>
              </SettingPanel>
            </ChromeTabsContent>
          </ChromeTabs>
        </Form>

        <SettingDialog
          open={assignRoleDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeAssignRoleDialog();
          }}
          title={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_TITLE")}
          description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeAssignRoleDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "workspace:assignRoleAll"}
                disabled={disabled || roleOptions.length === 0}
                onClick={() => {
                  void withSavingKey("workspace:assignRoleAll", async () => {
                    const roleValues = await form.validateFields(["assignRoleCode"]);
                    const values = await assignRoleDialogForm.validateFields();
                    await assignWorkspaceRoleMutation.mutateAsync({
                      roleCode: String(roleValues.assignRoleCode),
                      confirmName: String(values.confirmName || "").trim(),
                    });
                    closeAssignRoleDialog();
                  });
                }}
              >
                {t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM")}
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
                t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DIALOG_CONFIRM_DESC", {
                  role: assignRoleLabel,
                }),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === persistedWorkspaceName) {
                      return;
                    }
                    throw new Error(
                      t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_MISMATCH"),
                    );
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t(
                  "settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_PLACEHOLDER",
                )}
              />
            </Form.Item>
          </Form>
        </SettingDialog>

        <SettingDialog
          open={leaveDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeLeaveDialog();
          }}
          title={t("settings:SETTINGS_WORKSPACE_LEAVE_TITLE")}
          description={t("settings:SETTINGS_WORKSPACE_LEAVE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeLeaveDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "workspace:leave"}
                disabled={disabled}
                onClick={() => {
                  void withSavingKey("workspace:leave", async () => {
                    const values = await leaveDialogForm.validateFields();
                    await leaveWorkspaceMutation.mutateAsync(
                      String(values.confirmText || "").trim(),
                    );
                    await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeLeaveDialog();
                    await navigateAfterWorkspaceRemoved();
                  });
                }}
              >
                {t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_BUTTON")}
              </Button>
            </div>
          }
        >
          <Form form={leaveDialogForm} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="confirmText"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_TEXT_LABEL"),
                t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === "LEAVE") {
                      return;
                    }
                    throw new Error(t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>

        <SettingDialog
          open={deleteDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeDeleteDialog();
          }}
          title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
          description={t("settings:SETTINGS_WORKSPACE_DELETE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeDeleteDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "workspace:delete"}
                disabled={disabled || !isOrgOwner}
                onClick={() => {
                  void withSavingKey("workspace:delete", async () => {
                    const values = await deleteDialogForm.validateFields();
                    await deleteWorkspaceMutation.mutateAsync(
                      String(values.confirmName || "").trim(),
                    );
                    await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeDeleteDialog();
                    await navigateAfterWorkspaceRemoved();
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
                t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === persistedWorkspaceName) {
                      return;
                    }
                    throw new Error(t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>
      </PageState>
    </DefaultPage>
  );
}

function PlaceholderPoliciesPanel(props: {
  title: string;
  description: string;
  items: Array<{ title: string; description: string }>;
}) {
  const { t } = useTranslation(["common"]);
  return (
    <SettingPanel title={props.title} description={props.description}>
      <Accordion type="single" collapsible className="rounded-lg border border-border">
        {props.items.map((it, idx) => (
          <SettingAccordionItem
            key={`${it.title}-${idx}`}
            value={`placeholder-${idx}`}
            variant="action"
            title={it.title}
            description={it.description}
            disabled
            showSummary={false}
          >
            <div className="text-[16px] text-muted-foreground leading-snug">
              {t("common:PAGE_COMING_SOON_DESC")}
            </div>
          </SettingAccordionItem>
        ))}
      </Accordion>
    </SettingPanel>
  );
}
