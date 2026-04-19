import { useState, type MouseEvent } from "react";
import { Star } from "lucide-react";

import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { cn } from "@arclayer/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

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
const PROJECT_CARD_ACTION_BUTTON_CLASSNAME =
  "size-6 shrink-0 text-label-secondary transition-colors hover:text-label-primary";

function normalizeProjectDescriptionPreview(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

function buildProjectOverviewPath(projectId: string) {
  return `/projects/${projectId}`;
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
  const favoritePath = buildProjectOverviewPath(project.projectId);
  const favoritePaths = useFavoritesStore((state) => state.paths);
  const toggleFavorite = useFavoritesStore((state) => state.toggle);
  const isFavorited = favoritePaths.includes(favoritePath);
  const [favoriteHovered, setFavoriteHovered] = useState(false);

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    toggleFavorite(favoritePath);
  };

  const handleFavoritePointerDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

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
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip side="bottom">
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={isFavorited ? t("common:FAVORITE_REMOVE") : t("common:FAVORITE_ADD")}
                className={cn(
                  PROJECT_CARD_ACTION_BUTTON_CLASSNAME,
                  isFavorited &&
                    "text-amber-500 hover:text-amber-500 dark:text-amber-300 dark:hover:text-amber-300",
                )}
                onClick={handleFavoriteClick}
                onMouseDown={handleFavoritePointerDown}
                onMouseEnter={() => setFavoriteHovered(true)}
                onMouseLeave={() => setFavoriteHovered(false)}
              >
                <span className="inline-flex items-center justify-center">
                  <Star
                    size={16}
                    strokeWidth={2}
                    className={cn(
                      "transition-colors",
                      favoriteHovered || isFavorited ? "fill-current" : "fill-transparent",
                    )}
                  />
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isFavorited ? t("common:FAVORITE_REMOVE_TOOLTIP") : t("common:FAVORITE_ADD_TOOLTIP")}
            </TooltipContent>
          </Tooltip>
          <ProjectActionsDropdown menuItems={menuItems} onPrepareMenu={onPrepareMenu} />
        </div>
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

      {/* Footer: member summary */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <div onClick={(e) => e.stopPropagation()}>
          <ProjectMembersPopover project={project} t={t} />
        </div>
      </div>
    </div>
  );
}
