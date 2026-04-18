import { UserAvatar } from "@/components/common/entity-avatar";
import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { cn } from "@arclayer/lib/utils";

import type {
  ProjectMenuItem,
  UserCenterProjectListItem,
  UserCenterProjectsTranslateFn,
} from "../types";
import type { ProjectEditingField } from "../hooks/use-project-menu-actions";
import { ProjectActionsDropdown } from "./project-actions-dropdown";
import { ProjectInlineNameEditor } from "./project-inline-name-editor";
import { ProjectMembersPopover } from "./project-members-popover";

const PROJECT_NAME_MAX_LENGTH = 128;
const PROJECT_DESCRIPTION_MAX_LENGTH = 256;

function normalizeProjectDescriptionPreview(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

interface ProjectCardProps {
  project: UserCenterProjectListItem;
  menuItems: ProjectMenuItem[];
  onPrepareMenu?: () => void;
  t: UserCenterProjectsTranslateFn;
  editing: boolean;
  editingField: ProjectEditingField | null;
  editingName: string;
  editingDescription: string;
  onEditingNameChange: (value: string) => void;
  onEditingDescriptionChange: (value: string) => void;
  onCommitName: () => void;
  onCommitDescription: () => void;
  onCancelEdit: () => void;
  onClick?: () => void;
  className?: string;
}

export function ProjectCard({
  project,
  menuItems,
  onPrepareMenu,
  t,
  editing,
  editingField,
  editingName,
  editingDescription,
  onEditingNameChange,
  onEditingDescriptionChange,
  onCommitName,
  onCommitDescription,
  onCancelEdit,
  onClick,
  className,
}: ProjectCardProps) {
  const descriptionPreview = normalizeProjectDescriptionPreview(project.description);

  return (
    <div
      className={cn(
        "col-span-1 flex flex-col rounded-lg border border-border bg-card! p-4 !",
        "transition-colors! duration-200!",
        "hover:! hover:border-border/80! hover:bg-accent/50!",
        !editing && "cursor-pointer",
        className,
      )}
      onClick={editing ? undefined : onClick}
    >
      {/* Header: icon + action menu */}
      <div className="mb-4 flex flex-row justify-between">
        <div className="mr-4">
          <ProjectAvatar
            name={project.name}
            size={40}
            {...projectAvatarPropsFromIdentity(project)}
          />
        </div>
        <ProjectActionsDropdown menuItems={menuItems} onPrepareMenu={onPrepareMenu} />
      </div>

      {/* Title + description */}
      <div className="flex flex-col wrap-break-word" style={{ overflowWrap: "anywhere" }}>
        <ProjectInlineNameEditor
          editing={editing && editingField === "name"}
          value={project.name}
          draftValue={editingName}
          ariaLabel={t("account:ACCOUNT_PROJECTS_RENAME_INPUT_LABEL")}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          className="text-headline font-semibold"
          inputClassName="w-full text-headline font-semibold"
          onDraftChange={onEditingNameChange}
          onCommit={onCommitName}
          onCancel={onCancelEdit}
        />
        <ProjectInlineNameEditor
          editing={editing && editingField === "description"}
          value={descriptionPreview}
          draftValue={editingDescription}
          ariaLabel={t("account:ACCOUNT_PROJECTS_DESCRIPTION_INPUT_LABEL")}
          maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
          emptyFallback={t("account:ACCOUNT_PROJECTS_DESCRIPTION_FALLBACK")}
          className="text-footnote text-label-secondary line-clamp-2"
          containerClassName="mt-1"
          inputClassName="w-full text-footnote text-label-primary"
          onDraftChange={onEditingDescriptionChange}
          onCommit={onCommitDescription}
          onCancel={onCancelEdit}
        />
      </div>

      {/* Footer: member avatars + clickable count */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        {project.membersPreview.length > 0 && (
          <div className="flex -space-x-2">
            {project.membersPreview.slice(0, 3).map((member) => (
              <UserAvatar
                key={member.userId}
                name={member.displayName || member.username || "U"}
                assetRef={member.avatarUrl}
                size={24}
              />
            ))}
            {project.membersPreview.length > 3 ? (
              <div className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground ring-2 ring-background">
                +{project.membersPreview.length - 3}
              </div>
            ) : null}
          </div>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <ProjectMembersPopover project={project} t={t} />
        </div>
      </div>
    </div>
  );
}
