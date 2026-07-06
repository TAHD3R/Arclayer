import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Languages, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";

import { getProjectCoreSettings, patchProjectCoreSettings } from "@/api/settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import type { JsonValueInput } from "@arclayer/openapi/admin-types";
import { Form } from "@arclayer/ui/form";
import { Input } from "@arclayer/ui/input";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { cn } from "@arclayer/lib/utils";

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

type WebsiteConfigNavItem = {
  key: string;
  tab: GeneralSettingsTabKey;
  labelKey: string;
  descriptionKey: string;
  icon: typeof Globe;
};

function buildWebsiteConfigNavItems(): WebsiteConfigNavItem[] {
  return [
    {
      key: "website.basics",
      tab: "basics",
      labelKey: "settings:SETTINGS_SITE_SETTINGS_TAB_BASICS",
      descriptionKey: "settings:SETTINGS_SITE_SETTINGS_DESC",
      icon: Globe,
    },
    {
      key: "website.localization",
      tab: "localization",
      labelKey: "settings:SETTINGS_SITE_SETTINGS_TAB_LOCALIZATION",
      descriptionKey: "settings:SETTINGS_SITE_LOCALIZATION_PANEL_DESC",
      icon: Languages,
    },
  ];
}

function resolveWebsiteConfigTabNavigation(projectId: string, tab: GeneralSettingsTabKey) {
  const params = { projectId };
  if (tab === "localization") {
    return { to: "/projects/$projectId/seo/site/localization" as const, params };
  }
  return { to: "/projects/$projectId/seo/site" as const, params };
}

function WebsiteConfigSideNav(props: {
  activeTab: GeneralSettingsTabKey;
  items: WebsiteConfigNavItem[];
  onSelect: (tab: GeneralSettingsTabKey) => void;
}) {
  const { t } = useTranslation(["nav", "settings"]);
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return props.items;
    return props.items.filter((item) =>
      [t(item.labelKey), t(item.descriptionKey), item.key, item.tab]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [props.items, query, t]);

  return (
    <div className="flex min-h-0 flex-col gap-4 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings:SETTINGS_SITE_SEARCH_PLACEHOLDER")}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      <nav aria-label={t("settings:SETTINGS_SITE_SETTINGS_TITLE")}>
        {filteredItems.length ? (
          <ul className="flex flex-col gap-1">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const active = item.tab === props.activeTab;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    data-active={active ? "true" : "false"}
                    className={cn(
                      "flex w-full min-w-0 items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                      "text-label-secondary hover:bg-accent hover:text-label-primary",
                      active && "bg-accent text-label-primary",
                    )}
                    onClick={() => props.onSelect(item.tab)}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-callout font-semibold">
                        {t(item.labelKey)}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-footnote text-label-secondary">
                        {t(item.descriptionKey)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-md px-3 py-4 text-footnote text-label-secondary">
            {t("settings:SETTINGS_SITE_SEARCH_EMPTY")}
          </div>
        )}
      </nav>
    </div>
  );
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
        {activeTab === "basics" ? (
          <SiteSettingsTab
            assetProjectId={projectId}
            form={form}
            initialValues={initialValues}
            disabled={projectDisabled}
            savingKey={savingKey}
            withSavingKey={withSavingKey}
            patch={patchProject}
          />
        ) : null}

        {activeTab === "localization" ? (
          <LocalizationSettingsTab
            form={form}
            initialValues={initialValues}
            disabled={projectDisabled}
            savingKey={savingKey}
            withSavingKey={withSavingKey}
            patch={patchProject}
          />
        ) : null}
      </Form>
    </ContentGuard>
  );

  if (embedded) {
    return content;
  }

  const navItems = buildWebsiteConfigNavItems();

  return (
    <DefaultPage
      title={t("settings:SETTINGS_SITE_SETTINGS_TITLE")}
      description={t("settings:SETTINGS_SITE_SETTINGS_DESC")}
      showFavoriteToggle={false}
      headerBehavior="sticky"
      contentContainerClassName="min-h-full [--page-sticky-header-height:6rem]"
    >
      <div className="flex min-h-full w-full gap-8">
        <aside className="hidden min-h-full w-72 shrink-0 lg:block">
          <div className="sticky top-[var(--page-sticky-header-height,6rem)] flex max-h-[calc(100vh-var(--page-sticky-header-height,6rem)-1rem)] min-h-0 w-full flex-col overflow-y-auto pb-4">
            <WebsiteConfigSideNav
              items={navItems}
              activeTab={activeTab}
              onSelect={(nextTab) => {
                void navigate(resolveWebsiteConfigTabNavigation(projectId, nextTab));
              }}
            />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{content}</div>
      </div>
    </DefaultPage>
  );
}
