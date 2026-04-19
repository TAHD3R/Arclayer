import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { useWorkspacePermissionAccess } from "@/hooks/use-workspace-permission-access";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { Form } from "@arclayer/ui/form";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

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
  embedded?: boolean;
};

type GeneralSettingsTabNavigation = {
  to: "/projects/$projectId/settings/general" | "/projects/$projectId/settings/localization";
  params: { projectId: string };
};

function resolveGeneralSettingsTabNavigation(
  projectId: string,
  tab: GeneralSettingsTabKey,
): GeneralSettingsTabNavigation {
  if (tab === "localization") {
    return {
      to: "/projects/$projectId/settings/localization",
      params: { projectId },
    };
  }
  return {
    to: "/projects/$projectId/settings/general",
    params: { projectId },
  };
}

export function GeneralSettingsShell({
  activeTab,
  workspaceIdOverride,
  embedded = false,
}: GeneralSettingsPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const projectIdFromStore = useWorkspaceStore((s) => s.currentProjectId);
  const workspaceId = workspaceIdOverride ?? workspaceIdFromStore;
  const permissionAccess = useWorkspacePermissionAccess(workspaceId);

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

  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canManageSiteSettings =
    !permissionReady ||
    permissionAccess.hasPermission("system:site:manage") ||
    permissionAccess.hasAction("system:site:manage");
  const workspaceDisabled =
    workspaceCoreQuery.isFetching || saveWorkspaceMutation.isPending || !canManageSiteSettings;
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
      if (!projectIdFromStore) return;
      void navigate({
        ...resolveGeneralSettingsTabNavigation(String(projectIdFromStore), next),
      });
    },
    [navigate, projectIdFromStore],
  );

  const content = (
    <ContentGuard
      loading={workspaceCoreQuery.isLoading && !workspaceCoreQuery.data}
      loadingVariant="form"
      error={loadError}
      onRetry={loadError ? () => void workspaceCoreQuery.refetch() : undefined}
    >
      {!canManageSiteSettings ? (
        <div
          className="mb-6 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
          data-testid="general-settings-read-only-notice"
        >
          {t("settings:SETTINGS_SITE_SETTINGS_READ_ONLY_DESC")}
        </div>
      ) : null}
      <Form {...form}>
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
      </Form>
    </ContentGuard>
  );

  if (embedded) {
    return (
      <ChromeTabs
        value={activeTab}
        onValueChange={(next) => {
          handleTabChange(next as GeneralSettingsTabKey);
        }}
      >
        {content}
      </ChromeTabs>
    );
  }

  return (
    <ChromeTabs
      value={activeTab}
      onValueChange={(next) => {
        handleTabChange(next as GeneralSettingsTabKey);
      }}
    >
      <DefaultPage
        title={t("settings:SETTINGS_SITE_SETTINGS_TITLE")}
        description={t("settings:SETTINGS_SITE_SETTINGS_DESC")}
        headerVisibility="always"
        extra={
          <ChromeTabsList>
            <ChromeTabsTrigger value="basics">
              {t("settings:SETTINGS_SITE_SETTINGS_TAB_BASICS")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="localization">
              {t("settings:SETTINGS_SITE_SETTINGS_TAB_LOCALIZATION")}
            </ChromeTabsTrigger>
          </ChromeTabsList>
        }
      >
        {content}
      </DefaultPage>
    </ChromeTabs>
  );
}
