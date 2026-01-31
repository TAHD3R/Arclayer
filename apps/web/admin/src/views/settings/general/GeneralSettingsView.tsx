import { Form } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
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
import { SiteSettingsTab } from "./tabs/SiteSettingsTab";
import { StorageSettingsTab } from "./tabs/StorageSettingsTab";

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

  const coreQuery = useQuery({
    queryKey: ["settings", "core"],
    queryFn: async () => getCoreSettings(),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () => buildGeneralSettingsInitialValues(coreQuery.data),
    [coreQuery.data],
  );

  useEffect(() => {
    if (!coreQuery.data) return;
    form.setFieldsValue(initialValues);
  }, [coreQuery.data, form, initialValues]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchCoreSettings(patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["settings", "core"] });
    },
    onError: (err) => notifyError(err),
  });

  const patch: GeneralSettingsPatchFn = useCallback(
    async (patchValue: Record<string, unknown>) => {
      await saveMutation.mutateAsync(patchValue);
    },
    [saveMutation],
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

  const disabled = coreQuery.isFetching || saveMutation.isPending;
  const loadError = useMemo(() => {
    if (coreQuery.isError) return coreQuery.error;
    if (!coreQuery.isLoading && !coreQuery.data) {
      return new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"));
    }
    return null;
  }, [coreQuery.data, coreQuery.error, coreQuery.isError, coreQuery.isLoading, t]);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_GENERAL_TITLE")}
      description={t("settings:SETTINGS_GENERAL_DESC")}
      width="fixed"
    >
      <PageState
        loading={coreQuery.isLoading && !coreQuery.data}
        loadingVariant="form"
        error={loadError}
        onRetry={loadError ? () => void coreQuery.refetch() : undefined}
      >
        <Form<GeneralSettingsFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={disabled}
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
            </ChromeTabsList>

            <ChromeTabsContent value="site">
              <SiteSettingsTab
                form={form}
                initialValues={initialValues}
                disabled={disabled}
                savingKey={savingKey}
                withSavingKey={withSavingKey}
                patch={patch}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="localization">
              <LocalizationSettingsTab
                form={form}
                initialValues={initialValues}
                disabled={disabled}
                savingKey={savingKey}
                withSavingKey={withSavingKey}
                patch={patch}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="storage">
              <StorageSettingsTab
                form={form}
                initialValues={initialValues}
                disabled={disabled}
                savingKey={savingKey}
                withSavingKey={withSavingKey}
                patch={patch}
                coreSecrets={coreQuery.data?.secrets}
              />
            </ChromeTabsContent>
          </ChromeTabs>
        </Form>
      </PageState>
    </DefaultPage>
  );
}
