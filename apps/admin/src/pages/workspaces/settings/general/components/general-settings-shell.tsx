import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { DefaultPage } from "@/components/common/default-page";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";
import { Form } from "@celestial/ui/form";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ContentGuard } from "@/components/common/content-guard";
import { useSavingKey } from "@celestial/hooks/use-saving-key";

import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";
import type {
  GeneralSettingsFormValues,
  GeneralSettingsPatchFn,
  GeneralSettingsTabKey,
} from "@/types/settings-general";
import { LocalizationSettingsTab } from "./tabs/localization-settings-tab";
import { SiteSettingsTab } from "./tabs/site-settings-tab";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type GeneralSettingsPageProps = {
  activeTab: GeneralSettingsTabKey;
  workspaceIdOverride?: string | null;
};

type GeneralSettingsTabNavigation = {
  to: "/w/$workspaceId/settings/site/basics" | "/w/$workspaceId/settings/site/localization";
  params: { workspaceId: string };
};

function resolveGeneralSettingsTabNavigation(
  workspaceId: string,
  tab: GeneralSettingsTabKey,
): GeneralSettingsTabNavigation {
  if (tab === "localization") {
    return {
      to: "/w/$workspaceId/settings/site/localization",
      params: { workspaceId },
    };
  }
  return {
    to: "/w/$workspaceId/settings/site/basics",
    params: { workspaceId },
  };
}

export function GeneralSettingsShell({ activeTab, workspaceIdOverride }: GeneralSettingsPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceId = workspaceIdOverride ?? workspaceIdFromStore;

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

  const form = useForm<GeneralSettingsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!workspaceCoreQuery.data) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
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

  const handleTabChange = useCallback(
    (next: GeneralSettingsTabKey) => {
      if (!workspaceId) return;
      void navigate({
        ...resolveGeneralSettingsTabNavigation(String(workspaceId), next),
      });
    },
    [navigate, workspaceId],
  );

  return (
    <DefaultPage
      title={t("settings:SETTINGS_SITE_SETTINGS_TITLE")}
      description={t("settings:SETTINGS_SITE_SETTINGS_DESC")}
    >
      <ContentGuard
        loading={workspaceCoreQuery.isLoading && !workspaceCoreQuery.data}
        loadingVariant="form"
        error={loadError}
        onRetry={loadError ? () => void workspaceCoreQuery.refetch() : undefined}
      >
        <Form {...form}>
          <ChromeTabs
            value={activeTab}
            onValueChange={(next) => {
              handleTabChange(next as GeneralSettingsTabKey);
            }}
          >
            <ChromeTabsList>
              <ChromeTabsTrigger value="basics">
                {t("settings:SETTINGS_SITE_SETTINGS_TAB_BASICS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="localization">
                {t("settings:SETTINGS_SITE_SETTINGS_TAB_LOCALIZATION")}
              </ChromeTabsTrigger>
            </ChromeTabsList>

            <ChromeTabsContent value="basics">
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
