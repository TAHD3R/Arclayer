import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Code2, Database, Search, Server, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Accordion } from "@arclayer/ui/accordion";
import { checkProjectSlugAvailability, getProjectDetail, patchProject } from "@/api/projects";
import { getProjectCoreSettings, patchProjectCoreSettings } from "@/api/settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ProjectIconDialog } from "@/pages/usercenter/projects/components/project-icon-dialog";
import type { ProjectIconDialogValues } from "@/pages/usercenter/projects/hooks/use-project-menu-actions";
import type { UserCenterProjectListItem } from "@/pages/usercenter/projects/project-list-items";
import {
  SystemSettingItem,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import type { ProjectDetail, ProjectUpdateInput } from "@arclayer/openapi/admin-types";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { Input } from "@arclayer/ui/input";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { Textarea } from "@arclayer/ui/textarea";
import { cn } from "@arclayer/lib/utils";

import { ProjectApiKeysSettingsPage } from "../api-keys/page";
import { ProjectDatabasesPage } from "../databases/page";
import { ProjectEnvironmentsPage } from "../environments/page";
import {
  DEFAULT_PROJECT_SOURCE_SETTINGS,
  ProjectSourceSettingsSection,
  buildProjectSourcePatch,
  parseProjectSourceSettings,
  type ProjectSourceSettingsDraft,
  validateProjectSourceSettings,
} from "./components/project-source-settings-section";

const PROJECT_NAME_MAX_LENGTH = 128;
const PROJECT_DESCRIPTION_MAX_LENGTH = 256;
const PROJECT_CORE_SETTINGS_QUERY_KEY = "project-core-settings";

type ProjectSettingsTabKey = "general" | "api" | "environments" | "databases";

type ProjectSettingsPageProps = {
  activeTab: ProjectSettingsTabKey;
  projectId: string;
};

function mapProjectDetailToListItem(detail: ProjectDetail): UserCenterProjectListItem {
  return {
    id: detail.project.id,
    projectId: detail.project.id,
    workspaceId: detail.project.workspaceId,
    slug: detail.project.slug,
    name: detail.project.name,
    description: detail.project.description,
    iconMode: detail.project.iconMode,
    iconColor: detail.project.iconColor,
    iconGlyph: detail.project.iconGlyph ?? null,
    iconEmoji: detail.project.iconEmoji ?? null,
    iconUrl: detail.project.iconUrl,
    isArchived: !detail.project.isActive,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 0,
    membersPreview: [],
    createdAt: "",
    updatedAt: "",
    enterable: true,
    primaryRuntime: detail.primaryRuntime,
  };
}

function buildProjectIconDialogValues(project: UserCenterProjectListItem): ProjectIconDialogValues {
  return {
    iconMode: project.iconMode,
    iconColor: project.iconColor,
    iconGlyph: project.iconGlyph ?? null,
    iconEmoji: project.iconEmoji ?? null,
    iconUrl: project.iconUrl ?? null,
  };
}

function buildProjectIconPatch(values: ProjectIconDialogValues): ProjectUpdateInput {
  return {
    iconMode: values.iconMode,
    iconColor: values.iconColor,
    iconGlyph: values.iconMode === "glyph" ? values.iconGlyph : null,
    iconEmoji: values.iconMode === "emoji" ? values.iconEmoji : null,
    iconUrl: values.iconMode === "image" ? values.iconUrl : null,
  };
}

function resolveProjectSettingsTabNavigation(projectId: string, tab: ProjectSettingsTabKey) {
  const params = { projectId };
  switch (tab) {
    case "api":
      return { to: "/projects/$projectId/settings/api" as const, params };
    case "environments":
      return { to: "/projects/$projectId/settings/environments" as const, params };
    case "databases":
      return { to: "/projects/$projectId/settings/databases" as const, params };
    case "general":
    default:
      return { to: "/projects/$projectId/settings/general" as const, params };
  }
}

function buildProjectSettingsNavItems(): Array<{
  key: string;
  tab: ProjectSettingsTabKey;
  labelKey: string;
  descriptionKey: string;
  keywords: readonly string[];
  icon: typeof Settings2;
}> {
  return [
    {
      key: "project.general",
      tab: "general",
      labelKey: "account:SETTINGS_NAV_PROJECT_GENERAL",
      descriptionKey: "account:SETTINGS_PROJECT_DESC",
      keywords: ["identity", "slug", "source", "framework", "build"],
      icon: Settings2,
    },
    {
      key: "project.api",
      tab: "api",
      labelKey: "account:SETTINGS_NAV_PROJECT_API",
      descriptionKey: "account:SETTINGS_NAV_PROJECT_API_DESC",
      keywords: ["api", "keys", "tokens", "integration"],
      icon: Code2,
    },
    {
      key: "project.environments",
      tab: "environments",
      labelKey: "account:SETTINGS_PROJECT_ENVIRONMENTS_TITLE",
      descriptionKey: "account:SETTINGS_PROJECT_ENVIRONMENTS_DESC",
      keywords: ["environment", "preview", "production", "runtime"],
      icon: Server,
    },
    {
      key: "project.databases",
      tab: "databases",
      labelKey: "account:SETTINGS_PROJECT_DATABASES_TITLE",
      descriptionKey: "account:SETTINGS_PROJECT_DATABASES_DESC",
      keywords: ["database", "postgres", "credentials", "storage"],
      icon: Database,
    },
  ];
}

type ProjectSettingsNavItem = ReturnType<typeof buildProjectSettingsNavItems>[number];

const PROJECT_SETTINGS_SCOPE_ROWS = [
  {
    key: "project-ops",
    titleKey: "account:SETTINGS_PROJECT_SCOPE_PROJECT_OPS_TITLE",
    summaryKey: "account:SETTINGS_PROJECT_SCOPE_PROJECT_OPS_SUMMARY",
    descriptionKey: "account:SETTINGS_PROJECT_SCOPE_PROJECT_OPS_DESC",
    statusKey: "account:SETTINGS_PROJECT_SCOPE_STATUS_HERE",
    target: null,
  },
  {
    key: "website-ops",
    titleKey: "account:SETTINGS_PROJECT_SCOPE_WEBSITE_OPS_TITLE",
    summaryKey: "account:SETTINGS_PROJECT_SCOPE_WEBSITE_OPS_SUMMARY",
    descriptionKey: "account:SETTINGS_PROJECT_SCOPE_WEBSITE_OPS_DESC",
    statusKey: "account:SETTINGS_PROJECT_SCOPE_STATUS_MOVED",
    target: "website-domain",
  },
  {
    key: "builder-ops",
    titleKey: "account:SETTINGS_PROJECT_SCOPE_BUILDER_OPS_TITLE",
    summaryKey: "account:SETTINGS_PROJECT_SCOPE_BUILDER_OPS_SUMMARY",
    descriptionKey: "account:SETTINGS_PROJECT_SCOPE_BUILDER_OPS_DESC",
    statusKey: "account:SETTINGS_PROJECT_SCOPE_STATUS_LINKED",
    target: "editor",
  },
] as const;

type ProjectSettingsScopeTarget = NonNullable<
  (typeof PROJECT_SETTINGS_SCOPE_ROWS)[number]["target"]
>;

function resolveProjectSettingsScopeNavigation(
  projectId: string,
  target: ProjectSettingsScopeTarget,
) {
  const params = { projectId };
  switch (target) {
    case "editor":
      return { to: "/projects/$projectId/editor" as const, params };
    case "website-domain":
    default:
      return { to: "/projects/$projectId/website/domain" as const, params };
  }
}

function normalizeSettingsSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

function useProjectSettingsNavSearch(items: ProjectSettingsNavItem[], query: string) {
  const { t, i18n } = useTranslation(["account"]);

  return useMemo(() => {
    const term = normalizeSettingsSearchTerm(query);
    if (!term) return items;
    return items.filter((item) =>
      [t(item.labelKey), t(item.descriptionKey), item.tab, item.key, ...item.keywords]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [i18n.language, i18n.resolvedLanguage, items, query, t]);
}

function ProjectSettingsSideNav(props: {
  activeTab: ProjectSettingsTabKey;
  items: readonly ProjectSettingsNavItem[];
  onSelect: (tab: ProjectSettingsTabKey) => void;
}) {
  const { t } = useTranslation(["account"]);
  if (props.items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-4 text-footnote text-label-secondary">
        {t("account:SETTINGS_PROJECT_SEARCH_EMPTY")}
      </div>
    );
  }

  return (
    <nav aria-label={t("account:SETTINGS_PROJECT_TITLE")}>
      <ul className="flex flex-col gap-1">
        {props.items.map((item) => {
          const Icon = item.icon;
          const active = item.tab === props.activeTab;
          return (
            <li key={item.key}>
              <button
                type="button"
                data-active={active ? "true" : "false"}
                className={cn(
                  "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-callout transition-colors",
                  "text-label-secondary hover:bg-accent hover:text-label-primary",
                  active && "bg-accent font-semibold text-label-primary",
                )}
                onClick={() => props.onSelect(item.tab)}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function FieldMessage(props: { message: string | null }) {
  if (!props.message) return null;
  return <div className="text-footnote text-destructive">{props.message}</div>;
}

function ProjectSettingsScopeSection(props: { projectId: string }) {
  const { t } = useTranslation(["account"]);
  const navigate = useNavigate();

  return (
    <SystemSettingItem
      id="project-settings-scope"
      title={t("account:SETTINGS_PROJECT_SCOPE_TITLE")}
      description={t("account:SETTINGS_PROJECT_SCOPE_DESC")}
    >
      <SettingActionGroup>
        {PROJECT_SETTINGS_SCOPE_ROWS.map((item) => (
          <SettingActionItem
            key={item.key}
            as={item.target ? "button" : "div"}
            showChevron={Boolean(item.target)}
            title={t(item.titleKey)}
            summary={t(item.summaryKey)}
            description={t(item.descriptionKey)}
            onTrigger={
              item.target
                ? () =>
                    void navigate(
                      resolveProjectSettingsScopeNavigation(props.projectId, item.target),
                    )
                : undefined
            }
            right={
              <span className="rounded-sm border border-border bg-background px-2 py-1 text-caption font-medium text-label-secondary">
                {t(item.statusKey)}
              </span>
            }
          />
        ))}
      </SettingActionGroup>
    </SystemSettingItem>
  );
}

function ProjectGeneralSettingsTab(props: { projectId: string }) {
  const { projectId } = props;
  const { t } = useTranslation(["account", "common", "settings"]);
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const [nameDraft, setNameDraft] = useState("");
  const [slugDraft, setSlugDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<ProjectSourceSettingsDraft>(
    DEFAULT_PROJECT_SOURCE_SETTINGS,
  );
  const [sourceInitial, setSourceInitial] = useState<ProjectSourceSettingsDraft>(
    DEFAULT_PROJECT_SOURCE_SETTINGS,
  );
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [iconDialogProject, setIconDialogProject] = useState<UserCenterProjectListItem | null>(
    null,
  );
  const [iconDialogValues, setIconDialogValues] = useState<ProjectIconDialogValues>({
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });

  const detailQuery = useQuery({
    queryKey: ["project", "detail", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => getProjectDetail(projectId),
    retry: false,
    meta: { silent: true },
  });

  const projectCoreQuery = useQuery({
    queryKey: [PROJECT_CORE_SETTINGS_QUERY_KEY, projectId],
    enabled: Boolean(projectId),
    queryFn: async () => getProjectCoreSettings(projectId),
    retry: false,
    meta: { silent: true },
  });

  useEffect(() => {
    const project = detailQuery.data?.project;
    if (!project) return;
    setNameDraft(project.name);
    setSlugDraft(project.slug);
    setDescriptionDraft(project.description ?? "");
    setNameError(null);
    setSlugError(null);
  }, [detailQuery.data]);

  useEffect(() => {
    if (!projectCoreQuery.data) return;
    const next = parseProjectSourceSettings(projectCoreQuery.data);
    setSourceInitial(next);
    setSourceDraft(next);
    setSourceError(null);
  }, [projectCoreQuery.data]);

  const updateProjectMutation = useMutation({
    mutationFn: async (patch: ProjectUpdateInput) => patchProject(projectId, patch),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", "detail", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["global-nav", "projects"] }),
        queryClient.invalidateQueries({ queryKey: ["dataTable"] }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  const updateProjectSourceMutation = useMutation({
    mutationFn: async (draft: ProjectSourceSettingsDraft) =>
      patchProjectCoreSettings(projectId, buildProjectSourcePatch(draft)),
    onSuccess: async (detail) => {
      const next = parseProjectSourceSettings(detail);
      setSourceInitial(next);
      setSourceDraft(next);
      setSourceError(null);
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [PROJECT_CORE_SETTINGS_QUERY_KEY, projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project", "source", projectId],
        }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  const project = detailQuery.data?.project ?? null;
  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManageProject = permissionReady && permissionAccess.hasAction("project:settings:manage");
  const disabled = updateProjectMutation.isPending || !canManageProject;
  const sourceDisabled =
    disabled || projectCoreQuery.isLoading || updateProjectSourceMutation.isPending;

  const handlePatchProject = useCallback(
    async (patch: ProjectUpdateInput) => {
      await updateProjectMutation.mutateAsync(patch);
    },
    [updateProjectMutation],
  );

  const openIconDialog = () => {
    if (!detailQuery.data) return;
    const nextProject = mapProjectDetailToListItem(detailQuery.data);
    setIconDialogProject(nextProject);
    setIconDialogValues(buildProjectIconDialogValues(nextProject));
  };

  const saveProjectName = () =>
    withSavingKey("project:name", async () => {
      const nextName = nameDraft.trim();
      if (!nextName) {
        setNameError(t("account:ACCOUNT_PROJECTS_FIELD_NAME_REQUIRED"));
        throw new Error("FORM_VALIDATION_FAILED");
      }
      setNameError(null);
      await handlePatchProject({ name: nextName });
    });

  const saveProjectSlug = () =>
    withSavingKey("project:slug", async () => {
      if (!project) throw new Error("PROJECT_DETAIL_REQUIRED");
      const nextSlug = slugDraft.trim();
      if (!nextSlug) {
        setSlugError(t("account:ACCOUNT_PROJECTS_FIELD_SLUG_REQUIRED"));
        throw new Error("FORM_VALIDATION_FAILED");
      }
      const availability = await checkProjectSlugAvailability(
        project.workspaceId,
        nextSlug,
        projectId,
      );
      if (!availability.available || !availability.normalizedSlug) {
        const errorKey =
          availability.reason === "reserved"
            ? "account:ACCOUNT_PROJECTS_FIELD_SLUG_RESERVED"
            : availability.reason === "exists"
              ? "account:ACCOUNT_PROJECTS_FIELD_SLUG_EXISTS"
              : "account:ACCOUNT_PROJECTS_FIELD_SLUG_INVALID";
        setSlugError(t(errorKey));
        throw new Error("FORM_VALIDATION_FAILED");
      }
      setSlugError(null);
      setSlugDraft(availability.normalizedSlug);
      await handlePatchProject({ slug: availability.normalizedSlug });
    });

  const saveProjectDescription = () =>
    withSavingKey("project:description", async () => {
      await handlePatchProject({ description: descriptionDraft.trim() || null });
    });

  const saveProjectSource = () =>
    withSavingKey("project:source", async () => {
      const validationError = validateProjectSourceSettings(sourceDraft, t);
      if (validationError) {
        setSourceError(validationError);
        throw new Error("FORM_VALIDATION_FAILED");
      }
      setSourceError(null);
      await updateProjectSourceMutation.mutateAsync(sourceDraft);
    });

  const loadError = detailQuery.isError
    ? detailQuery.error
    : !detailQuery.isLoading && !detailQuery.data
      ? new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"))
      : null;

  return (
    <ContentGuard
      loading={detailQuery.isLoading && !detailQuery.data}
      loadingVariant="form"
      error={loadError}
      onRetry={loadError ? () => void detailQuery.refetch() : undefined}
    >
      {permissionReady && !canManageProject ? (
        <AccessNoticeAlert
          className="mb-6"
          description={t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
        />
      ) : null}

      <SystemSettingStack>
        <ProjectSettingsScopeSection projectId={projectId} />

        <SystemSettingItem
          id="project-identity"
          title={t("account:SETTINGS_NAV_PROJECT_GENERAL")}
          description={t("account:SETTINGS_PROJECT_DESC")}
        >
          <SettingActionGroup>
            <SettingActionItem
              title={t("common:ORG_WORKSPACES_ACTION_CHANGE_ICON")}
              summary={project ? project.iconMode : t("common:LOADING")}
              description={
                project
                  ? t("account:ACCOUNT_PROJECTS_ICON_DIALOG_DESC", { name: project.name })
                  : undefined
              }
              disabled={disabled || !project}
              onTrigger={openIconDialog}
              right={
                project ? (
                  <ProjectAvatar
                    name={project.name}
                    size={40}
                    {...projectAvatarPropsFromIdentity(project)}
                  />
                ) : null
              }
            />

            <Accordion type="single" collapsible className="px-0">
              <SettingAccordionItem
                value="project_name"
                variant="action"
                title={t("account:ACCOUNT_PROJECTS_FIELD_NAME")}
                description={t("account:ACCOUNT_PROJECTS_FIELD_NAME_DESC")}
                summary={nameDraft.trim()}
                showSummary
                placeholder={t("settings:SETTINGS_NOT_SET")}
                disabled={disabled}
                contentLayout="inline"
                confirmText={t("settings:SETTINGS_SAVE")}
                confirmLoading={savingKey === "project:name"}
                onConfirm={saveProjectName}
                onReset={() => {
                  setNameDraft(project?.name ?? "");
                  setNameError(null);
                }}
                resetText={t("settings:SETTINGS_RESET")}
              >
                <div className="grid gap-2">
                  <Input
                    value={nameDraft}
                    maxLength={PROJECT_NAME_MAX_LENGTH}
                    onChange={(event) => {
                      setNameDraft(event.target.value);
                      setNameError(null);
                    }}
                    placeholder={t("account:ACCOUNT_PROJECTS_FIELD_NAME_PLACEHOLDER")}
                  />
                  <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
                    <FieldMessage message={nameError} />
                    <span>
                      {nameDraft.length}/{PROJECT_NAME_MAX_LENGTH}
                    </span>
                  </div>
                </div>
              </SettingAccordionItem>

              <SettingAccordionItem
                value="project_slug"
                variant="action"
                title={t("account:ACCOUNT_PROJECTS_FIELD_SLUG")}
                description={t("account:ACCOUNT_PROJECTS_FIELD_SLUG_HELP")}
                summary={slugDraft.trim()}
                showSummary
                placeholder={t("settings:SETTINGS_NOT_SET")}
                disabled={disabled || !project}
                contentLayout="inline"
                confirmText={t("settings:SETTINGS_SAVE")}
                confirmLoading={savingKey === "project:slug"}
                onConfirm={saveProjectSlug}
                onReset={() => {
                  setSlugDraft(project?.slug ?? "");
                  setSlugError(null);
                }}
                resetText={t("settings:SETTINGS_RESET")}
              >
                <div className="grid gap-2">
                  <Input
                    value={slugDraft}
                    onChange={(event) => {
                      setSlugDraft(event.target.value);
                      setSlugError(null);
                    }}
                    placeholder={t("account:ACCOUNT_PROJECTS_FIELD_SLUG_PLACEHOLDER")}
                    autoComplete="off"
                  />
                  <FieldMessage message={slugError} />
                </div>
              </SettingAccordionItem>

              <SettingAccordionItem
                value="project_description"
                variant="action"
                title={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION")}
                description={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_DESC")}
                summary={descriptionDraft.trim()}
                showSummary
                placeholder={t("settings:SETTINGS_NOT_SET")}
                disabled={disabled}
                confirmText={t("settings:SETTINGS_SAVE")}
                confirmLoading={savingKey === "project:description"}
                onConfirm={saveProjectDescription}
                onReset={() => setDescriptionDraft(project?.description ?? "")}
                resetText={t("settings:SETTINGS_RESET")}
              >
                <Textarea
                  rows={4}
                  maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                  value={descriptionDraft}
                  onChange={(event) => setDescriptionDraft(event.target.value)}
                  placeholder={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_PLACEHOLDER")}
                />
                <div className="text-right text-caption text-label-secondary">
                  {descriptionDraft.length}/{PROJECT_DESCRIPTION_MAX_LENGTH}
                </div>
              </SettingAccordionItem>
            </Accordion>
          </SettingActionGroup>
        </SystemSettingItem>

        <ProjectSourceSettingsSection
          draft={sourceDraft}
          initial={sourceInitial}
          disabled={sourceDisabled}
          pending={savingKey === "project:source" || updateProjectSourceMutation.isPending}
          error={projectCoreQuery.isError ? t("settings:SETTINGS_LOAD_FAILED_DESC") : sourceError}
          onChange={(patch) => {
            setSourceDraft((current) => ({ ...current, ...patch }));
            setSourceError(null);
          }}
          onReset={() => {
            setSourceDraft(sourceInitial);
            setSourceError(null);
          }}
          onSave={saveProjectSource}
        />
      </SystemSettingStack>

      {iconDialogProject ? (
        <ProjectIconDialog
          t={(key, options) => t(key, options)}
          dialog={{
            project: iconDialogProject,
            setProject: setIconDialogProject,
            values: iconDialogValues,
            setValues: setIconDialogValues,
            pending: updateProjectMutation.isPending,
            onClose: () => setIconDialogProject(null),
            onConfirm: async () => {
              await withSavingKey("project:icon", async () => {
                await handlePatchProject(buildProjectIconPatch(iconDialogValues));
              });
              setIconDialogProject(null);
            },
          }}
        />
      ) : null}
    </ContentGuard>
  );
}

export function ProjectSettingsPage(props: ProjectSettingsPageProps) {
  const { activeTab, projectId } = props;
  const { t } = useTranslation(["account"]);
  const navigate = useNavigate();
  const navItems = useMemo(() => buildProjectSettingsNavItems(), []);
  const [query, setQuery] = useState("");
  const filteredNavItems = useProjectSettingsNavSearch(navItems, query);

  const content = (() => {
    switch (activeTab) {
      case "api":
        return <ProjectApiKeysSettingsPage projectId={projectId} embedded />;
      case "environments":
        return <ProjectEnvironmentsPage projectId={projectId} embedded />;
      case "databases":
        return <ProjectDatabasesPage projectId={projectId} embedded />;
      case "general":
      default:
        return <ProjectGeneralSettingsTab projectId={projectId} />;
    }
  })();

  return (
    <DefaultPage
      title={t("account:SETTINGS_PROJECT_TITLE")}
      description={t("account:SETTINGS_PROJECT_DESC")}
      showFavoriteToggle={false}
      headerBehavior="sticky"
      contentContainerClassName="min-h-full [--page-sticky-header-height:6rem]"
    >
      <div className="flex min-h-full w-full gap-8">
        <aside className="hidden min-h-full w-72 shrink-0 lg:block">
          <div className="sticky top-[var(--page-sticky-header-height,6rem)] flex max-h-[calc(100vh-var(--page-sticky-header-height,6rem)-1rem)] min-h-0 w-full flex-col gap-4 overflow-y-auto pb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("account:SETTINGS_PROJECT_SEARCH_PLACEHOLDER")}
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <ProjectSettingsSideNav
              items={filteredNavItems}
              activeTab={activeTab}
              onSelect={(nextTab) => {
                setQuery("");
                void navigate(resolveProjectSettingsTabNavigation(projectId, nextTab));
              }}
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{content}</div>
      </div>
    </DefaultPage>
  );
}
