import { useCallback, useMemo, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { ProjectListItem } from "@arclayer/openapi/admin-types";
import { cn } from "@arclayer/lib/utils";

import { HomeSectionHeader } from "./home-section-header";
import { ProjectActionDialogs } from "../usercenter/projects/components/usercenter-projects-dialogs";
import { ProjectActionsDropdown } from "../usercenter/projects/components/project-actions-dropdown";
import { ProjectInlineNameEditor } from "../usercenter/projects/components/project-inline-name-editor";
import {
  mapProjectToListItem,
  type UserCenterProjectListItem,
} from "../usercenter/projects/project-list-items";
import {
  useProjectMenuActions,
  type ProjectEditingField,
} from "../usercenter/projects/hooks/use-project-menu-actions";
import type { ProjectMenuItem, UserCenterProjectsTranslateFn } from "../usercenter/projects/types";

const PROJECT_NAME_MAX_LENGTH = 128;
const PROJECT_DESCRIPTION_MAX_LENGTH = 256;
const RECENT_PROJECT_MENU_ITEM_KEYS = ["rename", "archive", "delete"] as const;

function normalizeProjectDescriptionPreview(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function findProjectMenuItem(
  items: readonly ProjectMenuItem[],
  key: string,
): ProjectMenuItem | null {
  for (const item of items) {
    if (item.type === "divider") continue;
    if (item.key === key) return item;
    if (item.children?.length) {
      const child = findProjectMenuItem(item.children, key);
      if (child) return child;
    }
  }
  return null;
}

function buildRecentProjectMenuItems(items: readonly ProjectMenuItem[]): ProjectMenuItem[] {
  return RECENT_PROJECT_MENU_ITEM_KEYS.flatMap((key) => {
    const item = findProjectMenuItem(items, key);
    return item ? [item] : [];
  });
}

export function HomeRecentProjectsSection({
  workspaceId,
  projects,
}: {
  workspaceId: string | null;
  projects: readonly ProjectListItem[];
}) {
  const { t } = useTranslation(["ai", "account", "common", "errors"]);
  const projectT = useCallback<UserCenterProjectsTranslateFn>(
    (key, options) => t(key, options),
    [t],
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dateTime = useAdminDateTimeFormatter({ workspaceId });
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((state) => state.setCurrentProjectId);
  const projectItems = useMemo(() => projects.map(mapProjectToListItem), [projects]);

  const openCreateProject = () => {
    void navigate({ to: "/projects", search: { create: "1" } });
  };

  const enterProject = useCallback(
    (project: UserCenterProjectListItem) => {
      setCurrentWorkspaceId(project.workspaceId);
      setCurrentProjectId(project.projectId);
      void navigate({ to: projectHomePath(project.projectId) as never });
    },
    [navigate, setCurrentProjectId, setCurrentWorkspaceId],
  );

  const manageProject = useCallback(
    (project: UserCenterProjectListItem) => {
      setCurrentWorkspaceId(project.workspaceId);
      setCurrentProjectId(project.projectId);
      void navigate({ to: `/projects/${project.projectId}/settings/general/` as never });
    },
    [navigate, setCurrentProjectId, setCurrentWorkspaceId],
  );

  const projectMenuActions = useProjectMenuActions({
    workspaceId: workspaceId ?? undefined,
    t: projectT,
    onEnterProject: enterProject,
    onManageProject: manageProject,
    onArchiveSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home", "recent-projects"] });
    },
    onDeleteSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home", "recent-projects"] });
    },
  });

  const prepareProjectMenu = useCallback(
    (projectId: string) => {
      projectMenuActions.prepareProjectDangerCapabilities(projectId);
    },
    [projectMenuActions.prepareProjectDangerCapabilities],
  );

  return (
    <section className="mx-auto w-full max-w-[94rem]" aria-labelledby="home-recent-projects-title">
      <HomeSectionHeader
        title={t("ai:AI_CHAT_HOME_RECENT_PROJECTS")}
        actionLabel={t("ai:AI_CHAT_HOME_SEE_ALL_PROJECTS")}
        titleId="home-recent-projects-title"
        testId="home-recent-project-section"
        onAction={() => void navigate({ to: "/projects" })}
      />
      <div className="grid grid-flow-col auto-cols-[15rem] gap-4 overflow-x-auto pb-2 [scrollbar-width:none] sm:auto-cols-[16.5rem] md:auto-cols-[18rem] xl:grid-flow-row xl:grid-cols-[repeat(4,minmax(0,1fr))] xl:overflow-visible xl:pb-0 [&::-webkit-scrollbar]:hidden">
        <CreateProjectHomeCard
          label={t("ai:AI_CHAT_HOME_CREATE_PROJECT")}
          onClick={openCreateProject}
        />
        {projectItems.map((project) => (
          <RecentProjectCard
            key={project.projectId}
            project={project}
            updatedLabel={t("ai:AI_CHAT_HOME_PROJECT_UPDATED_AT", {
              date: dateTime.formatDateTime(project.updatedAt),
            })}
            menuItems={buildRecentProjectMenuItems(projectMenuActions.buildMenuItems(project))}
            editing={projectMenuActions.editingProjectId === project.projectId}
            editingField={projectMenuActions.editingProjectField}
            editingName={projectMenuActions.editingProjectName}
            editingDescription={projectMenuActions.editingProjectDescription}
            navigationSuppressed={projectMenuActions.isProjectEditNavigationSuppressed}
            t={projectT}
            onPrepareMenu={() => prepareProjectMenu(project.projectId)}
            onEditingNameChange={projectMenuActions.setEditingProjectName}
            onEditingDescriptionChange={projectMenuActions.setEditingProjectDescription}
            onCommitEdit={(field) => void projectMenuActions.commitProjectEdit(project, field)}
            onCancelEdit={projectMenuActions.cancelProjectEdit}
            onClick={() => enterProject(project)}
          />
        ))}
      </div>
      <ProjectActionDialogs
        t={projectT}
        archiveDialog={projectMenuActions.archiveDialog}
        deleteDialog={projectMenuActions.deleteDialog}
        iconDialog={projectMenuActions.iconDialog}
      />
    </section>
  );
}

function CreateProjectHomeCard(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="group flex w-full cursor-pointer flex-col gap-2.5 text-left"
      data-testid="lovart-home-create-project-card"
      onClick={props.onClick}
    >
      <div
        className="relative w-full overflow-hidden rounded-xl border border-dashed border-border/80 bg-muted/35 transition-[background-color,border-color,box-shadow] duration-200 group-hover:border-border group-hover:bg-accent/35 group-hover:shadow-sm"
        style={{ aspectRatio: "239.2 / 135.4" }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-label-secondary transition-colors group-hover:text-label-primary">
          <PlusIcon className="size-5" aria-hidden="true" />
        </div>
      </div>
      <div className="flex min-h-10 w-full shrink-0 flex-col items-start justify-start px-1">
        <div className="flex h-5 w-full items-center text-headline text-label-primary">
          {props.label}
        </div>
      </div>
    </button>
  );
}

function RecentProjectCard(props: {
  project: UserCenterProjectListItem;
  updatedLabel: string;
  menuItems: Parameters<typeof ProjectActionsDropdown>[0]["menuItems"];
  editing: boolean;
  editingField: ProjectEditingField | null;
  editingName: string;
  editingDescription: string;
  navigationSuppressed: boolean;
  t: UserCenterProjectsTranslateFn;
  onPrepareMenu: () => void;
  onEditingNameChange: (value: string) => void;
  onEditingDescriptionChange: (value: string) => void;
  onCommitEdit: (field: ProjectEditingField) => void;
  onCancelEdit: () => void;
  onClick: () => void;
}) {
  const descriptionPreview = normalizeProjectDescriptionPreview(props.project.description);
  const activateCard = () => {
    if (props.editing || props.navigationSuppressed) return;
    props.onClick();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateCard();
  };

  return (
    <div
      role="button"
      tabIndex={props.editing ? -1 : 0}
      data-testid="lovart-project-card"
      className={cn(
        "group/card flex w-full flex-col gap-3 text-left outline-none",
        props.editing ? "cursor-default" : "cursor-pointer",
      )}
      onClick={activateCard}
      onKeyDown={handleKeyDown}
    >
      <ProjectPreviewFrame project={props.project} />
      <div className="flex w-full shrink-0 flex-col justify-center gap-1 px-1">
        <div className="flex min-h-6 w-full shrink-0 items-center gap-2">
          <ProjectInlineNameEditor
            editing={props.editing && props.editingField === "name"}
            value={props.project.name}
            draftValue={props.editingName}
            ariaLabel={props.t("account:ACCOUNT_PROJECTS_RENAME_INPUT_LABEL")}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            counterPlacement="suffix"
            className="block min-w-0 flex-1 truncate text-headline text-label-primary"
            containerClassName="min-w-0 flex-1"
            inputClassName="h-8 text-headline font-medium"
            onDraftChange={props.onEditingNameChange}
            onCommit={() => props.onCommitEdit("name")}
            onCancel={props.onCancelEdit}
          />
          <ProjectActionsDropdown
            menuItems={props.menuItems}
            onPrepareMenu={props.onPrepareMenu}
            buttonClassName="size-7 rounded-full opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-[state=open]:opacity-100"
          />
        </div>
        {props.editing && props.editingField === "description" ? (
          <ProjectInlineNameEditor
            editing
            value={descriptionPreview}
            draftValue={props.editingDescription}
            ariaLabel={props.t("account:ACCOUNT_PROJECTS_DESCRIPTION_INPUT_LABEL")}
            maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
            emptyFallback={props.t("account:ACCOUNT_PROJECTS_DESCRIPTION_FALLBACK")}
            className="block truncate text-caption text-label-secondary"
            inputClassName="w-full text-caption text-label-primary"
            onDraftChange={props.onEditingDescriptionChange}
            onCommit={() => props.onCommitEdit("description")}
            onCancel={props.onCancelEdit}
          />
        ) : (
          <div
            className="block min-w-0 max-w-full shrink-0 truncate text-caption text-label-secondary"
            title={props.updatedLabel}
          >
            {props.updatedLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectPreviewFrame(props: { project: UserCenterProjectListItem }) {
  const hasImage = props.project.iconMode === "image" && Boolean(props.project.iconUrl);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border/75 bg-muted/35 transition-[border-color,box-shadow,transform] duration-200 group-hover/card:border-border group-hover/card:shadow-sm"
      style={{ aspectRatio: "239.2 / 135.4" }}
    >
      {hasImage ? (
        <img
          src={props.project.iconUrl ?? undefined}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-90 transition-transform duration-300 group-hover/card:scale-[1.02]"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-background/80 shadow-sm ring-1 ring-border/70">
            <ProjectAvatar
              name={props.project.name}
              size={42}
              className="rounded-xl"
              {...projectAvatarPropsFromIdentity(props.project)}
            />
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center gap-1.5 opacity-70">
        <span className="h-1.5 flex-1 rounded-full bg-background/70" />
        <span className="h-1.5 w-8 rounded-full bg-background/55" />
        <span className="h-1.5 w-4 rounded-full bg-background/45" />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100",
          hasImage ? "bg-background/10" : "bg-accent/20",
        )}
      />
    </div>
  );
}
