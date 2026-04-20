import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";

import { getProjectCoreSettings, patchProjectCoreSettings } from "@/api/settings";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
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

type GeneralSettingsPageProps = {
  activeTab: GeneralSettingsTabKey;
  projectId: string;
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
  projectId,
  embedded = false,
}: GeneralSettingsPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const permissionAccess = useProjectPermissionAccess(projectId);

  const projectCoreQuery = useQuery({
    queryKey: ["settings", "project", "core", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => getProjectCoreSettings(String(projectId)),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const initialValues = useMemo<GeneralSettingsFormValues>(
    () =>
      buildGeneralSettingsInitialValues({
        project: projectCoreQuery.data,
      }),
    [projectCoreQuery.data],
  );

  const form = useForm<GeneralSettingsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!projectCoreQuery.data) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [form, initialValues, projectCoreQuery.data]);

  const saveProjectMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      projectId
        ? patchProjectCoreSettings(String(projectId), patch)
        : Promise.reject(new Error("PROJECT_NOT_SELECTED")),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["settings", "project", "core", projectId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const patchProject: GeneralSettingsPatchFn = useCallback(
    async (patchValue: Record<string, unknown>) => {
      await saveProjectMutation.mutateAsync(patchValue);
    },
    [saveProjectMutation],
  );

  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canManageSiteSettings =
    !permissionReady ||
    permissionAccess.hasPermission("system:site:manage") ||
    permissionAccess.hasAction("system:site:manage");
  const projectDisabled =
    projectCoreQuery.isFetching || saveProjectMutation.isPending || !canManageSiteSettings;
  const loadError = useMemo(() => {
    if (projectCoreQuery.isError) return projectCoreQuery.error;
    if (!projectCoreQuery.isLoading && !projectCoreQuery.data) {
      return new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"));
    }
    return null;
  }, [
    t,
    projectCoreQuery.data,
    projectCoreQuery.error,
    projectCoreQuery.isError,
    projectCoreQuery.isLoading,
  ]);

  const handleTabChange = useCallback(
    (next: GeneralSettingsTabKey) => {
      void navigate({
        ...resolveGeneralSettingsTabNavigation(String(projectId), next),
      });
    },
    [navigate, projectId],
  );

  const content = (
    <ContentGuard
      loading={projectCoreQuery.isLoading && !projectCoreQuery.data}
      loadingVariant="form"
      error={loadError}
      onRetry={loadError ? () => void projectCoreQuery.refetch() : undefined}
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
            disabled={projectDisabled}
            savingKey={savingKey}
            withSavingKey={withSavingKey}
            patch={patchProject}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="localization">
          <LocalizationSettingsTab
            form={form}
            initialValues={initialValues}
            disabled={projectDisabled}
            savingKey={savingKey}
            withSavingKey={withSavingKey}
            patch={patchProject}
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
