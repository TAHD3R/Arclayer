import { Form } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getCoreSettings,
  getSystemCoreSettings,
  patchCoreSettings,
  patchSystemCoreSettings,
} from "@/api/settings";
import { DefaultPage } from "@/components/app/defaultPage";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { PageState } from "@/components/app/pageState";

import { buildGeneralSettingsInitialValues } from "./adapters";
import type { GeneralSettingsPatchFn, WithSavingKeyFn } from "./context";
import type { GeneralSettingsFormValues, GeneralSettingsTabKey } from "./types";
import { LocalizationSettingsTab } from "./tabs/LocalizationSettingsTab";
import { MessagingSettingsTab } from "./tabs/MessagingSettingsTab";
import { SiteSettingsTab } from "./tabs/SiteSettingsTab";
import { StorageSettingsTab } from "./tabs/StorageSettingsTab";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

type GeneralSettingsViewProps = {
  /**
   * 当前 Tab（用于支持 URL 深链接/外部跳转）。
   * - 不传则组件内部默认使用 site
   */
  tab?: GeneralSettingsTabKey;
  onTabChange?: (next: GeneralSettingsTabKey) => void;
};

export function GeneralSettingsView(props: GeneralSettingsViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<GeneralSettingsFormValues>();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const workspaceCoreQuery = useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const systemCoreQuery = useQuery({
    queryKey: ["settings", "system", "core"],
    enabled: Boolean(workspaceId),
    queryFn: async () => getSystemCoreSettings(),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () =>
      buildGeneralSettingsInitialValues({
        workspace: workspaceCoreQuery.data,
        system: systemCoreQuery.isError ? undefined : systemCoreQuery.data,
      }),
    [systemCoreQuery.data, systemCoreQuery.isError, workspaceCoreQuery.data],
  );

  useEffect(() => {
    if (!workspaceCoreQuery.data) return;
    // Avoid overriding user edits when system scope arrives later.
    if (form.isFieldsTouched()) return;
    form.setFieldsValue(initialValues);
  }, [form, initialValues, systemCoreQuery.data, workspaceCoreQuery.data]);

  const saveWorkspaceMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      workspaceId
        ? patchCoreSettings(String(workspaceId), patch)
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "core", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const patchWorkspace: GeneralSettingsPatchFn = useCallback(
    async (patchValue: Record<string, unknown>) => {
      await saveWorkspaceMutation.mutateAsync(patchValue);
    },
    [saveWorkspaceMutation],
  );

  const saveSystemMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchSystemCoreSettings(patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "system", "core"] });
    },
    onError: (err) => notifyError(err),
  });

  const patchSystem: GeneralSettingsPatchFn = useCallback(
    async (patchValue: Record<string, unknown>) => {
      await saveSystemMutation.mutateAsync(patchValue);
    },
    [saveSystemMutation],
  );

  // 统一的 savingKey 管理：解决 validateFields 抛错时 loading“卡住”的问题。
  const withSavingKey: WithSavingKeyFn = useCallback(async (key, fn) => {
    setSavingKey(key);
    try {
      await fn();
    } finally {
      setSavingKey(null);
    }
  }, []);

  const workspaceDisabled = workspaceCoreQuery.isFetching || saveWorkspaceMutation.isPending;
  const messagingDisabled =
    workspaceDisabled ||
    systemCoreQuery.isFetching ||
    saveSystemMutation.isPending ||
    systemCoreQuery.isError;
  const loadError = useMemo(() => {
    if (workspaceCoreQuery.isError) return workspaceCoreQuery.error;
    if (!workspaceCoreQuery.isLoading && !workspaceCoreQuery.data) {
      return new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"));
    }
    return null;
  }, [
    t,
    workspaceCoreQuery.data,
    workspaceCoreQuery.error,
    workspaceCoreQuery.isError,
    workspaceCoreQuery.isLoading,
  ]);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_GENERAL_TITLE")}
      description={t("settings:SETTINGS_GENERAL_DESC")}
      width="fixed"
    >
      <PageState
        loading={workspaceCoreQuery.isLoading && !workspaceCoreQuery.data}
        loadingVariant="form"
        error={loadError}
        onRetry={loadError ? () => void workspaceCoreQuery.refetch() : undefined}
      >
        <Form<GeneralSettingsFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={workspaceDisabled}
          initialValues={initialValues}
        >
          <ChromeTabs
            {...(props.tab
              ? {
                  value: props.tab,
                  onValueChange: (next) => {
                    props.onTabChange?.(next as GeneralSettingsTabKey);
                  },
                }
              : { defaultValue: "site" })}
          >
            <ChromeTabsList>
              <ChromeTabsTrigger value="site">
                {t("settings:SETTINGS_GENERAL_TAB_SITE")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="localization">
                {t("settings:SETTINGS_GENERAL_TAB_LOCALIZATION")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="storage">
                {t("settings:SETTINGS_GENERAL_TAB_STORAGE")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="messaging">
                {t("settings:SETTINGS_GENERAL_TAB_MESSAGING")}
              </ChromeTabsTrigger>
            </ChromeTabsList>

            <ChromeTabsContent value="site">
              <SiteSettingsTab
                form={form}
                initialValues={initialValues}
                disabled={workspaceDisabled}
                savingKey={savingKey}
                withSavingKey={withSavingKey}
                patch={patchWorkspace}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="localization">
              <LocalizationSettingsTab
                form={form}
                initialValues={initialValues}
                disabled={workspaceDisabled}
                savingKey={savingKey}
                withSavingKey={withSavingKey}
                patch={patchWorkspace}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="storage">
              <StorageSettingsTab
                form={form}
                initialValues={initialValues}
                disabled={workspaceDisabled}
                savingKey={savingKey}
                withSavingKey={withSavingKey}
                patch={patchWorkspace}
                coreSecrets={workspaceCoreQuery.data?.secrets}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="messaging">
              <MessagingSettingsTab
                form={form}
                initialValues={initialValues}
                disabled={messagingDisabled}
                savingKey={savingKey}
                withSavingKey={withSavingKey}
                patch={patchWorkspace}
                patchSystem={patchSystem}
                coreSecrets={systemCoreQuery.data?.secrets}
              />
            </ChromeTabsContent>
          </ChromeTabs>
        </Form>
      </PageState>
    </DefaultPage>
  );
}
