import { Form } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { getSystemCoreSettings, patchSystemCoreSettings } from "@/api/settings";
import { PageState } from "@/components/common/page-state";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";
import type { GeneralSettingsPatchFn, WithSavingKeyFn } from "@/types/settings-general";
import type { GeneralSettingsFormValues } from "@/types/settings-general";
import { MessagingSettingsTab } from "@/components/common/settings/general/tabs/messaging-settings-tab";
import { StorageSettingsTab } from "@/components/common/settings/general/tabs/storage-settings-tab";

export function DeploymentSettingsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<GeneralSettingsFormValues>();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const systemCoreQuery = useQuery({
    queryKey: ["settings", "system", "core"],
    queryFn: async () => getSystemCoreSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () => buildGeneralSettingsInitialValues({ system: systemCoreQuery.data }),
    [systemCoreQuery.data],
  );

  useEffect(() => {
    if (!systemCoreQuery.data) return;
    // Avoid overriding user edits when the request refetches.
    if (form.isFieldsTouched()) return;
    form.setFieldsValue(initialValues);
  }, [form, initialValues, systemCoreQuery.data]);

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

  const withSavingKey: WithSavingKeyFn = useCallback(async (key, fn) => {
    setSavingKey(key);
    try {
      await fn();
    } finally {
      setSavingKey(null);
    }
  }, []);

  const disabled = systemCoreQuery.isFetching || saveSystemMutation.isPending;

  return (
    <PageState
      loading={systemCoreQuery.isLoading && !systemCoreQuery.data}
      loadingVariant="form"
      error={systemCoreQuery.isError ? systemCoreQuery.error : null}
      onRetry={() => void systemCoreQuery.refetch()}
    >
      <Form<GeneralSettingsFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        autoComplete="off"
        disabled={disabled}
        initialValues={initialValues}
      >
        <div className="flex flex-col gap-8">
          <StorageSettingsTab
            form={form}
            initialValues={initialValues}
            disabled={disabled}
            savingKey={savingKey}
            withSavingKey={withSavingKey}
            patch={patchSystem}
            coreSecrets={systemCoreQuery.data?.secrets}
          />

          <MessagingSettingsTab
            form={form}
            initialValues={initialValues}
            disabled={disabled || systemCoreQuery.isError}
            savingKey={savingKey}
            withSavingKey={withSavingKey}
            patch={patchSystem}
            coreSecrets={systemCoreQuery.data?.secrets}
          />
        </div>
      </Form>
    </PageState>
  );
}
