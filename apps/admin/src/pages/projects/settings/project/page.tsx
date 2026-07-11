import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Code2, Database, Search, Server, Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  archiveProject,
  deleteProject,
  getProjectDangerCapabilities,
  getProjectDetail,
  patchProject,
} from "@/api/projects";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ProjectIconDialog } from "@/pages/usercenter/projects/components/project-icon-dialog";
import type { ProjectIconDialogValues } from "@/pages/usercenter/projects/hooks/use-project-menu-actions";
import type { UserCenterProjectListItem } from "@/pages/usercenter/projects/project-list-items";
import type { ProjectDetail, ProjectUpdateInput } from "@arclayer/openapi/admin-types";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { Button } from "@arclayer/ui/button";
import { FieldError } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";
import { cn } from "@arclayer/lib/utils";

import { ProjectApiKeysSettingsPage } from "../api-keys/page";
import { ProjectDatabasesPage } from "../databases/page";
import { ProjectEnvironmentsPage } from "../environments/page";

const PROJECT_NAME_MAX_LENGTH = 128;
const PROJECT_DESCRIPTION_MAX_LENGTH = 256;

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
      keywords: ["identity", "slug", "description"],
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
  return <FieldError>{props.message}</FieldError>;
}

function ProjectGeneralSettingsTab(props: { projectId: string }) {
  const { projectId } = props;
  const { t } = useTranslation(["account", "common", "settings"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { savingKey, withSavingKey } = useSavingKey();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
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

  const dangerQuery = useQuery({
    queryKey: ["project", "danger-capabilities", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => getProjectDangerCapabilities(projectId),
    retry: false,
    meta: { silent: true },
  });

  useEffect(() => {
    const project = detailQuery.data?.project;
    if (!project) return;
    setNameDraft(project.name);
    setDescriptionDraft(project.description ?? "");
    setNameError(null);
    setDescriptionError(null);
  }, [detailQuery.data]);

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

  const leaveProjectSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: ["projects-cards"] });
    await navigate({ to: "/projects" });
  };

  const archiveProjectMutation = useMutation({
    mutationFn: async () => archiveProject(projectId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setArchiveOpen(false);
      await leaveProjectSettings();
    },
    onError: (error) => notifyError(error),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => deleteProject(projectId, deleteConfirmation.trim()),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setDeleteOpen(false);
      setDeleteConfirmation("");
      await leaveProjectSettings();
    },
    onError: (error) => notifyError(error),
  });

  const project = detailQuery.data?.project ?? null;
  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManageProject = permissionReady && permissionAccess.hasAction("project:settings:manage");
  const disabled = updateProjectMutation.isPending || !canManageProject;
  const dangerCapabilities = dangerQuery.data;
  const archiveEnabled = canManageProject && Boolean(dangerCapabilities?.archiveAction.enabled);
  const deleteEnabled = canManageProject && Boolean(dangerCapabilities?.deleteAction.enabled);
  const deleteConfirmationMatches =
    deleteConfirmation.trim() === (dangerCapabilities?.confirmDeleteName ?? project?.name ?? "");
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

  const resetIdentityDraft = () => {
    setNameDraft(project?.name ?? "");
    setDescriptionDraft(project?.description ?? "");
    setNameError(null);
    setDescriptionError(null);
  };

  const identityDirty = project
    ? nameDraft !== project.name || descriptionDraft !== (project.description ?? "")
    : false;

  const saveProjectIdentity = () =>
    withSavingKey("project:identity", async () => {
      if (!project) throw new Error("PROJECT_DETAIL_REQUIRED");
      const nextName = nameDraft.trim();
      const nextDescription = descriptionDraft.trim();

      if (!nextName) {
        setNameError(t("account:ACCOUNT_PROJECTS_FIELD_NAME_REQUIRED"));
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (descriptionDraft.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
        setDescriptionError(
          t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_MAX", {
            max: PROJECT_DESCRIPTION_MAX_LENGTH,
          }),
        );
        throw new Error("FORM_VALIDATION_FAILED");
      }

      setNameError(null);
      setDescriptionError(null);
      await handlePatchProject({
        name: nextName,
        description: nextDescription || null,
      });
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

      <form
        id="project-identity"
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (identityDirty && canManageProject) void saveProjectIdentity();
        }}
      >
        <header>
          <h2 className="text-title2 font-semibold text-label-primary">
            {t("account:SETTINGS_PROJECT_IDENTITY_TITLE")}
          </h2>
          <p className="mt-1 max-w-2xl text-body text-label-secondary">
            {t("account:SETTINGS_PROJECT_IDENTITY_DESC")}
          </p>
        </header>

        <div className="flex flex-col gap-4 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {project ? (
              <ProjectAvatar
                name={project.name}
                size={48}
                {...projectAvatarPropsFromIdentity(project)}
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-headline font-medium text-label-primary">
                {t("account:SETTINGS_PROJECT_ICON_TITLE")}
              </div>
              <div className="text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_ICON_DESC")}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="project-icon-action"
            disabled={disabled || !project}
            onClick={openIconDialog}
          >
            {t("settings:SETTINGS_EDIT")}
          </Button>
        </div>

        <div className="grid gap-5">
          <div className="grid content-start gap-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="project-name-input" className="text-headline text-label-primary">
                {t("account:ACCOUNT_PROJECTS_FIELD_NAME")}
              </label>
              <span className="text-caption text-label-secondary">
                {nameDraft.length}/{PROJECT_NAME_MAX_LENGTH}
              </span>
            </div>
            <p className="text-footnote text-label-secondary">
              {t("account:ACCOUNT_PROJECTS_FIELD_NAME_DESC")}
            </p>
            <Input
              id="project-name-input"
              name="name"
              data-testid="project-name-input"
              value={nameDraft}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              disabled={disabled}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setNameError(null);
              }}
              placeholder={t("account:ACCOUNT_PROJECTS_FIELD_NAME_PLACEHOLDER")}
              aria-invalid={Boolean(nameError)}
              autoComplete="off"
            />
            <FieldMessage message={nameError} />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="project-description-input"
                className="text-headline text-label-primary"
              >
                {t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION")}
              </label>
              <span className="text-caption text-label-secondary">
                {descriptionDraft.length}/{PROJECT_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <p className="text-footnote text-label-secondary">
              {t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_DESC")}
            </p>
            <Textarea
              id="project-description-input"
              name="description"
              data-testid="project-description-input"
              rows={4}
              maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
              value={descriptionDraft}
              disabled={disabled}
              onChange={(event) => {
                setDescriptionDraft(event.target.value);
                setDescriptionError(null);
              }}
              placeholder={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_PLACEHOLDER")}
              aria-invalid={Boolean(descriptionError)}
            />
            <FieldMessage message={descriptionError} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={!identityDirty || updateProjectMutation.isPending}
            onClick={resetIdentityDraft}
          >
            {t("settings:SETTINGS_RESET")}
          </Button>
          <Button
            type="submit"
            loading={savingKey === "project:identity" || updateProjectMutation.isPending}
            disabled={!identityDirty || disabled}
          >
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </div>
      </form>

      <section className="mt-12 border-t border-border pt-8" aria-labelledby="project-danger-title">
        <h2 id="project-danger-title" className="text-title2 font-semibold text-label-primary">
          {t("account:SETTINGS_PROJECT_DANGER_TITLE")}
        </h2>
        <p className="mt-1 max-w-2xl text-body text-label-secondary">
          {t("account:SETTINGS_PROJECT_DANGER_DESC")}
        </p>

        <div className="mt-5 divide-y divide-border border-y border-border">
          <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-headline font-medium text-label-primary">
                <Archive aria-hidden="true" size={17} />
                {t("account:SETTINGS_PROJECT_ARCHIVE_TITLE")}
              </div>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_ARCHIVE_DESC")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!archiveEnabled || archiveProjectMutation.isPending}
              onClick={() => setArchiveOpen(true)}
              data-testid="project-archive-trigger"
            >
              {t("account:ACCOUNT_PROJECTS_ACTION_ARCHIVE")}
            </Button>
          </div>
          <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-headline font-medium text-label-primary">
                <Trash2 aria-hidden="true" size={17} />
                {t("account:SETTINGS_PROJECT_DELETE_TITLE")}
              </div>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_DELETE_DESC")}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteEnabled || deleteProjectMutation.isPending}
              onClick={() => {
                setDeleteConfirmation("");
                setDeleteOpen(true);
              }}
              data-testid="project-delete-trigger"
            >
              {t("account:ACCOUNT_PROJECTS_ACTION_DELETE")}
            </Button>
          </div>
        </div>
      </section>

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

      <SettingDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        preventInitialFocus={false}
        title={t("account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_TITLE")}
        description={t("account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_DESC", {
          name: project?.name ?? "",
        })}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={archiveProjectMutation.isPending}
              onClick={() => setArchiveOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={archiveProjectMutation.isPending}
              disabled={!archiveEnabled}
              onClick={() => void archiveProjectMutation.mutateAsync()}
              data-testid="project-archive-confirm"
            >
              {t("account:ACCOUNT_PROJECTS_ACTION_ARCHIVE")}
            </Button>
          </div>
        }
      >
        <div className="border-y border-border py-3 text-footnote text-label-secondary">
          {t("account:SETTINGS_PROJECT_ARCHIVE_RUNTIME_WARNING")}
        </div>
      </SettingDialog>

      <SettingDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteProjectMutation.isPending) setDeleteOpen(open);
          if (!open) setDeleteConfirmation("");
        }}
        preventInitialFocus={false}
        title={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_TITLE")}
        description={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_DESC", {
          name: project?.name ?? "",
        })}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={deleteProjectMutation.isPending}
              onClick={() => setDeleteOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={deleteProjectMutation.isPending}
              disabled={!deleteEnabled || !deleteConfirmationMatches}
              onClick={() => void deleteProjectMutation.mutateAsync()}
              data-testid="project-delete-confirm"
            >
              {t("account:ACCOUNT_PROJECTS_ACTION_DELETE")}
            </Button>
          </div>
        }
      >
        <SettingDialogField
          title={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_LABEL", {
            name: dangerCapabilities?.confirmDeleteName ?? project?.name ?? "",
          })}
          description={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_HELP")}
        >
          <Input
            id="project-delete-confirm-name"
            name="confirmName"
            aria-label={t("account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_PLACEHOLDER")}
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            disabled={deleteProjectMutation.isPending}
          />
        </SettingDialogField>
      </SettingDialog>
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
      headerBehavior="sticky"
      contentContainerClassName="[--page-sticky-header-height:6rem]"
    >
      <div className="flex w-full gap-8">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-[var(--page-sticky-header-height,6rem)] flex max-h-[calc(100vh-var(--page-sticky-header-height,6rem)-1rem)] min-h-0 w-full flex-col gap-4 overflow-y-auto pb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
              <Input
                id="project-settings-search"
                name="projectSettingsSearch"
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
