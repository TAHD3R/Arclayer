import { Form } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { DefaultPage } from "@/components/common/default-page";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ContentGuard } from "@/components/common/content-guard";

import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";
import type {
  GeneralSettingsFormValues,
  GeneralSettingsPatchFn,
  GeneralSettingsTabKey,
  WithSavingKeyFn,
} from "@/types/settings-general";
import { LocalizationSettingsTab } from "@/components/common/settings/general/tabs/localization-settings-tab";
import { SiteSettingsTab } from "@/components/common/settings/general/tabs/site-settings-tab";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

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

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () =>
      buildGeneralSettingsInitialValues({
        workspace: workspaceCoreQuery.data,
      }),
    [workspaceCoreQuery.data],
  );

  useEffect(() => {
    if (!workspaceCoreQuery.data) return;
    // Avoid overriding user edits when refetching.
    if (form.isFieldsTouched()) return;
    form.setFieldsValue(initialValues);
  }, [form, initialValues, workspaceCoreQuery.data]);

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
      title={t("settings:SETTINGS_SITE_IDENTITY_TITLE")}
      description={t("settings:SETTINGS_SITE_IDENTITY_DESC")}
      width="fixed"
    >
      <ContentGuard
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
                {t("settings:SETTINGS_SITE_IDENTITY_TAB_SITE")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="localization">
                {t("settings:SETTINGS_SITE_IDENTITY_TAB_LOCALIZATION")}
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
          </ChromeTabs>
        </Form>
      </ContentGuard>
    </DefaultPage>
  );
}
