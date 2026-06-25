import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Accordion } from "@arclayer/ui/accordion";
import { useTranslation } from "react-i18next";

import { checkProjectSlugAvailability, getProjectDetail, patchProject } from "@/api/projects";
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
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { Input } from "@arclayer/ui/input";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { Textarea } from "@arclayer/ui/textarea";

import { ProjectDeploymentsPage } from "../../deployments/page";
import { ProjectApiKeysSettingsPage } from "../api-keys/page";
import { ProjectDatabasesPage } from "../databases/page";
import { ProjectDomainSettingsPage } from "../domain/page";
import { ProjectEnvironmentsPage } from "../environments/page";

const PROJECT_NAME_MAX_LENGTH = 128;
const PROJECT_DESCRIPTION_MAX_LENGTH = 256;

type ProjectSettingsTabKey =
  | "general"
  | "api"
  | "domain"
  | "environments"
  | "deployments"
  | "databases";

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
    case "domain":
      return { to: "/projects/$projectId/settings/domain" as const, params };
    case "environments":
      return { to: "/projects/$projectId/settings/environments" as const, params };
    case "deployments":
      return { to: "/projects/$projectId/settings/deployments" as const, params };
    case "databases":
      return { to: "/projects/$projectId/settings/databases" as const, params };
    case "general":
    default:
      return { to: "/projects/$projectId/settings/general" as const, params };
  }
}

function FieldMessage(props: { message: string | null }) {
  if (!props.message) return null;
  return <div className="text-footnote text-destructive">{props.message}</div>;
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

  useEffect(() => {
    const project = detailQuery.data?.project;
    if (!project) return;
    setNameDraft(project.name);
    setSlugDraft(project.slug);
    setDescriptionDraft(project.description ?? "");
    setNameError(null);
    setSlugError(null);
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

  const project = detailQuery.data?.project ?? null;
  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManageProject = permissionReady && permissionAccess.hasAction("project:settings:manage");
  const disabled = updateProjectMutation.isPending || !canManageProject;

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

      <div className="grid gap-8">
        <SettingPanel
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
                <div className="space-y-2">
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
                <div className="space-y-2">
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
        </SettingPanel>
      </div>

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

  return (
    <ChromeTabs
      value={activeTab}
      onValueChange={(next) => {
        void navigate(
          resolveProjectSettingsTabNavigation(projectId, next as ProjectSettingsTabKey),
        );
      }}
    >
      <DefaultPage
        title={t("account:SETTINGS_PROJECT_TITLE")}
        description={t("account:SETTINGS_PROJECT_DESC")}
        headerVisibility="always"
        extra={
          <ChromeTabsList>
            <ChromeTabsTrigger value="general">
              {t("account:SETTINGS_NAV_PROJECT_GENERAL")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="api">
              {t("account:SETTINGS_NAV_PROJECT_API")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="domain">
              {t("account:SETTINGS_NAV_PROJECT_DOMAIN")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="environments">
              {t("account:SETTINGS_PROJECT_ENVIRONMENTS_TITLE")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="deployments">
              {t("account:SETTINGS_PROJECT_DEPLOYMENTS_TITLE")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="databases">
              {t("account:SETTINGS_PROJECT_DATABASES_TITLE")}
            </ChromeTabsTrigger>
          </ChromeTabsList>
        }
      >
        <ChromeTabsContent value="general">
          <ProjectGeneralSettingsTab projectId={projectId} />
        </ChromeTabsContent>

        <ChromeTabsContent value="api">
          <ProjectApiKeysSettingsPage projectId={projectId} embedded />
        </ChromeTabsContent>

        <ChromeTabsContent value="domain">
          <ProjectDomainSettingsPage projectId={projectId} embedded />
        </ChromeTabsContent>

        <ChromeTabsContent value="environments">
          <ProjectEnvironmentsPage projectId={projectId} embedded />
        </ChromeTabsContent>

        <ChromeTabsContent value="deployments">
          <ProjectDeploymentsPage projectId={projectId} embedded />
        </ChromeTabsContent>

        <ChromeTabsContent value="databases">
          <ProjectDatabasesPage projectId={projectId} embedded />
        </ChromeTabsContent>
      </DefaultPage>
    </ChromeTabs>
  );
}
