import { UserAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";
import { cn } from "@arclayer/lib/utils";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import { WorkspaceActionsDropdown } from "./workspace-actions-dropdown";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

interface WorkspaceCardProps {
  workspace: UserCenterWorkspaceListItem;
  menuItems: WorkspaceMenuItem[];
  t: UserCenterWorkspacesTranslateFn;
  onClick?: () => void;
  className?: string;
}

export function WorkspaceCard({ workspace, menuItems, t, onClick, className }: WorkspaceCardProps) {
  return (
    <div
      className={cn(
        "col-span-1 flex cursor-pointer flex-col rounded-lg border border-border bg-card! p-4 !",
        "transition-colors! duration-200!",
        "hover:! hover:border-border/80! hover:bg-accent/50!",
        className,
      )}
      onClick={onClick}
    >
      {/* Header: icon + action menu */}
      <div className="mb-4 flex flex-row justify-between">
        <div className="mr-4">
          <WorkspaceAvatar name={workspace.name} assetRef={workspace.iconUrl} size={40} />
        </div>
        <WorkspaceActionsDropdown menuItems={menuItems} />
      </div>

      {/* Title + description */}
      <div className="flex flex-col wrap-break-word" style={{ overflowWrap: "anywhere" }}>
        <div className="text-headline font-semibold">{workspace.name}</div>
        <div className="text-footnote text-label-secondary line-clamp-2">
          {workspace.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
        </div>
      </div>

      {/* Footer: member avatars + clickable count */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        {workspace.membersPreview.length > 0 && (
          <div className="flex -space-x-2">
            {workspace.membersPreview.slice(0, 3).map((member) => (
              <UserAvatar
                key={member.userId}
                name={member.displayName || member.username || "U"}
                assetRef={member.avatarUrl}
                size={24}
              />
            ))}
            {workspace.membersPreview.length > 3 ? (
              <div className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground ring-2 ring-background">
                +{workspace.membersPreview.length - 3}
              </div>
            ) : null}
          </div>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <WorkspaceMembersPopover workspace={workspace} />
        </div>
      </div>
    </div>
  );
}
