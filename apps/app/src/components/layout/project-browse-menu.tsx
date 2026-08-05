import { House, PanelsTopLeft } from "lucide-react";

import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import type { ProjectAvatarIdentity } from "@/components/common/project-avatar";
import {
  DropdownMenuGroup,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
} from "@arclayer/ui/dropdown-menu";

export type SidebarBrowseProject = ProjectAvatarIdentity & {
  projectId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  enterable: boolean;
};

export function ProjectBrowseMenuContent(props: {
  projects: readonly SidebarBrowseProject[];
  activeProjectId?: string | null;
  descriptionFallback: string;
  allProjectsLabel: string;
  homeLabel: string;
  onProjectSelect: (projectId: string) => void;
  onAllProjectsSelect: () => void;
  onHomeSelect: () => void;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-none">
        <DropdownMenuGroup>
          {props.projects.map((project) => (
            <DropdownMenuIconItem
              key={project.projectId}
              icon={
                <ProjectAvatar
                  name={project.name}
                  size={18}
                  className="rounded-sm ring-0"
                  {...projectAvatarPropsFromIdentity(project)}
                />
              }
              disabled={!project.enterable}
              aria-current={project.projectId === props.activeProjectId ? "page" : undefined}
              onSelect={() => props.onProjectSelect(project.projectId)}
            >
              <div className="min-w-0">
                <div className="truncate text-callout font-semibold text-label-primary">
                  {project.name}
                </div>
                <div className="truncate text-caption text-label-secondary">
                  {project.description?.trim() || props.descriptionFallback}
                </div>
              </div>
            </DropdownMenuIconItem>
          ))}
        </DropdownMenuGroup>
      </div>
      <DropdownMenuGroup className="shrink-0">
        <DropdownMenuIconItem
          icon={<PanelsTopLeft className="size-4" aria-hidden="true" />}
          onSelect={props.onAllProjectsSelect}
        >
          {props.allProjectsLabel}
        </DropdownMenuIconItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator className="shrink-0" />
      <DropdownMenuGroup className="shrink-0">
        <DropdownMenuIconItem
          icon={<House className="size-4" aria-hidden="true" />}
          onSelect={props.onHomeSelect}
        >
          {props.homeLabel}
        </DropdownMenuIconItem>
      </DropdownMenuGroup>
    </>
  );
}
