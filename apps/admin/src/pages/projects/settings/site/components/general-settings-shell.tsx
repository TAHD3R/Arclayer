import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";

import { getProjectCoreSettings, patchProjectCoreSettings } from "@/api/settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import type { JsonValueInput } from "@arclayer/openapi/admin-types";
import { Form } from "@arclayer/ui/form";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";
import type { GeneralSettingsFormValues, GeneralSettingsPatchFn } from "@/types/settings-general";
import { LocalizationSettingsTab } from "./tabs/localization-settings-tab";
import { SiteSettingsTab } from "./tabs/site-settings-tab";

type GeneralSettingsPageProps = {
  projectId: string;
  embedded?: boolean;
};

type WebsiteSettingsSection = "identity" | "discovery" | "localization";

export function GeneralSettingsShell({ projectId, embedded = false }: GeneralSettingsPageProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const [activeSection, setActiveSection] = useState<WebsiteSettingsSection>("identity");

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
    mutationFn: async (patch: Record<string, JsonValueInput>) =>
      projectId
        ? patchProjectCoreSettings(String(projectId), patch)
        : Promise.reject(new Error("PROJECT_NOT_SELECTED")),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["settings", "project", "core", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project", "source", projectId],
        }),
      ]);
    },
    onError: (err) => notifyError(err),
  });

  const patchProject: GeneralSettingsPatchFn = useCallback(
    async (patchValue: Record<string, JsonValueInput>) => {
      await saveProjectMutation.mutateAsync(patchValue);
    },
    [saveProjectMutation],
  );

  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManageSiteSettings =
    permissionReady && permissionAccess.hasAction("project:settings:manage");
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

  const content = (
    <ContentGuard
      loading={projectCoreQuery.isLoading && !projectCoreQuery.data}
      loadingVariant="form"
      error={loadError}
      onRetry={loadError ? () => void projectCoreQuery.refetch() : undefined}
    >
      {permissionReady && !canManageSiteSettings ? (
        <AccessNoticeAlert
          className="mb-6"
          data-testid="general-settings-read-only-notice"
          description={t("settings:SETTINGS_SITE_SETTINGS_READ_ONLY_DESC")}
        />
      ) : null}
      <Form {...form}>
        <ChromeTabs
          value={activeSection}
          onValueChange={(value) => setActiveSection(value as WebsiteSettingsSection)}
          className="flex min-w-0 flex-col"
        >
          <ChromeTabsList
            aria-label={t("settings:SETTINGS_SITE_SETTINGS_TITLE")}
            className="border-b border-border"
            wrapperClassName="mb-8"
          >
            <ChromeTabsTrigger value="identity" data-testid="website-settings-tab-identity">
              {t("settings:SETTINGS_SITE_BASICS_IDENTITY_PANEL_TITLE")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="discovery" data-testid="website-settings-tab-discovery">
              {t("settings:SETTINGS_SITE_BASICS_BROWSER_PANEL_TITLE")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="localization" data-testid="website-settings-tab-localization">
              {t("settings:SETTINGS_SITE_LOCALIZATION_PANEL_TITLE")}
            </ChromeTabsTrigger>
          </ChromeTabsList>

          {activeSection === "identity" ? (
            <SiteSettingsTab
              section="identity"
              assetProjectId={projectId}
              form={form}
              initialValues={initialValues}
              disabled={projectDisabled}
              savingKey={savingKey}
              withSavingKey={withSavingKey}
              patch={patchProject}
            />
          ) : null}
          {activeSection === "discovery" ? (
            <SiteSettingsTab
              section="discovery"
              assetProjectId={projectId}
              form={form}
              initialValues={initialValues}
              disabled={projectDisabled}
              savingKey={savingKey}
              withSavingKey={withSavingKey}
              patch={patchProject}
            />
          ) : null}
          {activeSection === "localization" ? (
            <LocalizationSettingsTab
              form={form}
              initialValues={initialValues}
              disabled={projectDisabled}
              savingKey={savingKey}
              withSavingKey={withSavingKey}
              patch={patchProject}
            />
          ) : null}
        </ChromeTabs>
      </Form>
    </ContentGuard>
  );

  if (embedded) {
    return content;
  }

  return (
    <DefaultPage
      title={t("settings:SETTINGS_SITE_SETTINGS_TITLE")}
      description={t("settings:SETTINGS_SITE_SETTINGS_DESC")}
      showFavoriteToggle={false}
      headerBehavior="sticky"
      contentContainerClassName="min-h-full [--page-sticky-header-height:6rem]"
    >
      {content}
    </DefaultPage>
  );
}
