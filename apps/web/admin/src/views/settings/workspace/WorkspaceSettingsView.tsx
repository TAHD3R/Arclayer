import { Form, Input, Select } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { getWorkspaceDetail, patchWorkspaceDetail } from "@/api/workspaces";
import { DefaultPage } from "@/components/app/defaultPage";
import { PageState } from "@/components/app/pageState";
import { Accordion } from "@/components/animate-ui/components/radix/accordion";
import { SettingAccordionItem } from "@/components/app/settingAccordionItem";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { SettingPanel } from "@/components/app/settingPanel";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import type { AppLocale } from "@/utils/i18n";

type WorkspaceSettingsTabKey =
  | "basics"
  | "collaboration"
  | "content_strategy"
  | "integrations"
  | "resource_processing";

type FormValues = {
  name: string;
  slug: string;
  locale: AppLocale;
  timezone: string;
  dateFormat: string;
};

function normalizeSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function isValidSlug(slug: string): boolean {
  // Keep it aligned with backend: ^[a-z0-9]+(?:-[a-z0-9]+)*$
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function pickString(obj: unknown, path: readonly string[]): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return typeof cur === "string" ? cur : undefined;
}

function formatLocaleLabel(locale: AppLocale, t: (key: string) => string): string {
  if (locale === "zh-CN") return t("account:ACCOUNT_LANGUAGE_ZH");
  return t("account:ACCOUNT_LANGUAGE_EN");
}

const COMMON_TIMEZONES = [
  "Asia/Shanghai",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
] as const;

const DATE_FORMAT_ITEMS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-01-28)" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD (2026/01/28)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (01/28/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (28/01/2026)" },
] as const;

export function WorkspaceSettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const withSavingKey = React.useCallback(async (key: string, fn: () => Promise<void>) => {
    setSavingKey(key);
    try {
      await fn();
    } finally {
      setSavingKey(null);
    }
  }, []);

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

  React.useEffect(() => {
    if (!detailQuery.data) return;
    if (form.isFieldTouched("name") || form.isFieldTouched("slug")) return;
    form.setFieldsValue({
      name: detailQuery.data.name,
      slug: detailQuery.data.slug,
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
      locale:
        (pickString(value, ["workspace_localization", "locale"]) as AppLocale | undefined) ??
        "zh-CN",
      timezone: pickString(value, ["workspace_localization", "timezone"]) ?? "Asia/Shanghai",
      dateFormat: pickString(value, ["workspace_localization", "date_format"]) ?? "YYYY-MM-DD",
    });
  }, [coreQuery.data, form]);

  const patchWorkspaceMutation = useMutation({
    mutationFn: async (patch: { name?: string; slug?: string }) => {
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

  const disabled =
    detailQuery.isFetching ||
    coreQuery.isFetching ||
    patchWorkspaceMutation.isPending ||
    patchWorkspaceCoreMutation.isPending ||
    Boolean(savingKey);

  const initialWorkspaceName = detailQuery.data?.name ?? "";
  const initialWorkspaceSlug = detailQuery.data?.slug ?? "";
  const currentWorkspaceName =
    (Form.useWatch("name", form) as string | undefined) ?? initialWorkspaceName;
  const currentWorkspaceSlug =
    (Form.useWatch("slug", form) as string | undefined) ?? initialWorkspaceSlug;

  const initialWorkspaceLocale = ((pickString(coreQuery.data?.value, [
    "workspace_localization",
    "locale",
  ]) as AppLocale | undefined) ?? "zh-CN") as AppLocale;
  const initialWorkspaceTimezone =
    pickString(coreQuery.data?.value, ["workspace_localization", "timezone"]) ?? "Asia/Shanghai";
  const initialWorkspaceDateFormat =
    pickString(coreQuery.data?.value, ["workspace_localization", "date_format"]) ?? "YYYY-MM-DD";

  const workspaceLocale =
    (Form.useWatch("locale", form) as AppLocale | undefined) ?? initialWorkspaceLocale;
  const workspaceTimezone =
    (Form.useWatch("timezone", form) as string | undefined) ?? initialWorkspaceTimezone;
  const workspaceDateFormat =
    (Form.useWatch("dateFormat", form) as string | undefined) ?? initialWorkspaceDateFormat;

  const workspaceLocaleLabel = workspaceLocale ? formatLocaleLabel(workspaceLocale, t) : undefined;
  const workspaceDateFormatLabel =
    DATE_FORMAT_ITEMS.find((it) => it.value === workspaceDateFormat)?.label ?? workspaceDateFormat;

  const isWorkspaceNameDirty = (currentWorkspaceName || "") !== (initialWorkspaceName || "");
  const isWorkspaceSlugDirty =
    normalizeSlug(currentWorkspaceSlug) !== normalizeSlug(initialWorkspaceSlug);
  const isWorkspaceLocaleDirty = (workspaceLocale || "") !== (initialWorkspaceLocale || "");
  const isWorkspaceTimezoneDirty = (workspaceTimezone || "") !== (initialWorkspaceTimezone || "");
  const isWorkspaceDateFormatDirty =
    (workspaceDateFormat || "") !== (initialWorkspaceDateFormat || "");

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <PageState
        loading={Boolean(workspaceId && detailQuery.isLoading && !detailQuery.data)}
        loadingVariant="form"
        empty={!workspaceId}
        emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
        emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
        error={detailQuery.isError ? detailQuery.error : coreQuery.isError ? coreQuery.error : null}
        onRetry={() => {
          void detailQuery.refetch();
          void coreQuery.refetch();
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
            slug: detailQuery.data?.slug ?? "",
            locale:
              (pickString(coreQuery.data?.value, ["workspace_localization", "locale"]) as
                | AppLocale
                | undefined) ?? "zh-CN",
            timezone:
              pickString(coreQuery.data?.value, ["workspace_localization", "timezone"]) ??
              "Asia/Shanghai",
            dateFormat:
              pickString(coreQuery.data?.value, ["workspace_localization", "date_format"]) ??
              "YYYY-MM-DD",
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

                      <SettingAccordionItem
                        value="workspace_slug"
                        variant="action"
                        title={t("settings:SETTINGS_WORKSPACE_SLUG_LABEL")}
                        description={t("settings:SETTINGS_WORKSPACE_SLUG_ITEM_DESC")}
                        showSummary
                        summary={normalizeSlug(currentWorkspaceSlug)}
                        placeholder={t("settings:SETTINGS_NOT_SET")}
                        keepRendered
                        disabled={disabled || !detailQuery.data}
                        confirmText={t("settings:SETTINGS_SAVE")}
                        confirmLoading={savingKey === "workspace:slug"}
                        onConfirm={() =>
                          void withSavingKey("workspace:slug", async () => {
                            const values = await form.validateFields(["slug"]);
                            const next = normalizeSlug(String(values.slug || ""));
                            // Normalize input so users can see the final slug immediately.
                            form.setFieldValue("slug", next);
                            await patchWorkspaceMutation.mutateAsync({ slug: next });
                          })
                        }
                        onReset={
                          isWorkspaceSlugDirty && detailQuery.data
                            ? () =>
                                void withSavingKey("reset:workspace:slug", async () => {
                                  const next = normalizeSlug(initialWorkspaceSlug);
                                  form.setFieldValue("slug", next);
                                  await patchWorkspaceMutation.mutateAsync({ slug: next });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:workspace:slug"}
                      >
                        <Form.Item
                          name="slug"
                          rules={[
                            {
                              required: true,
                              message: t("settings:SETTINGS_WORKSPACE_SLUG_REQUIRED"),
                            },
                            {
                              validator: async (_rule, value) => {
                                const slug = normalizeSlug(String(value || ""));
                                if (!slug)
                                  throw new Error(t("settings:SETTINGS_WORKSPACE_SLUG_REQUIRED"));
                                if (slug.length > 64)
                                  throw new Error(t("settings:SETTINGS_WORKSPACE_SLUG_TOO_LONG"));
                                if (!isValidSlug(slug))
                                  throw new Error(t("settings:SETTINGS_WORKSPACE_SLUG_INVALID"));
                              },
                            },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            size="large"
                            placeholder={t("settings:SETTINGS_WORKSPACE_SLUG_PLACEHOLDER")}
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
                            await patchWorkspaceCoreMutation.mutateAsync({
                              workspace_localization: { locale: values.locale },
                            });
                          })
                        }
                        onReset={
                          isWorkspaceLocaleDirty && coreQuery.data
                            ? () =>
                                void withSavingKey("reset:workspace:locale", async () => {
                                  form.setFieldValue("locale", initialWorkspaceLocale);
                                  await patchWorkspaceCoreMutation.mutateAsync({
                                    workspace_localization: { locale: initialWorkspaceLocale },
                                  });
                                })
                            : undefined
                        }
                        resetLoading={savingKey === "reset:workspace:locale"}
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
                          <div className="text-muted-foreground mb-4">
                            {t("settings:SETTINGS_WORKSPACE_LOCALIZATION_NOTE", {
                              locale: workspaceLocaleLabel ?? "-",
                            })}
                          </div>
                          <Select
                            size="large"
                            options={[
                              { value: "zh-CN", label: t("account:ACCOUNT_LANGUAGE_ZH") },
                              { value: "en-US", label: t("account:ACCOUNT_LANGUAGE_EN") },
                            ]}
                          />
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
                            options={COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
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
                          <Select
                            size="large"
                            options={DATE_FORMAT_ITEMS.map((it) => ({
                              value: it.value,
                              label: it.label,
                            }))}
                          />
                        </Form.Item>
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
                    title: t("settings:SETTINGS_WORKSPACE_COLLAB_DEFAULT_ROLE_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_COLLAB_DEFAULT_ROLE_DESC"),
                  },
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
          </ChromeTabs>
        </Form>
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
