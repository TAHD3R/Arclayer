import { Avatar, Button as AntButton } from "antd";
import { MoreVertical } from "lucide-react";

import type { OrganizationWorkspace } from "@/types/api";
import { cn } from "@celestial/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@celestial/ui/dropdown-menu";

import type { OrganizationWorkspacesTranslateFn, WorkspaceMenuItem } from "../types";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

interface WorkspaceCardProps {
  workspace: OrganizationWorkspace;
  menuItems: WorkspaceMenuItem[];
  t: OrganizationWorkspacesTranslateFn;
  onClick?: () => void;
  className?: string;
}

export function WorkspaceCard({ workspace, menuItems, t, onClick, className }: WorkspaceCardProps) {
  return (
    <div
      className={cn(
        "col-span-1 flex cursor-pointer flex-col rounded-lg border border-border bg-card! p-4 shadow-sm!",
        "transition-colors! duration-200!",
        "hover:shadow-md! hover:border-border/80! hover:bg-accent/50!",
        className,
      )}
      onClick={onClick}
    >
      {/* Header: icon + action menu */}
      <div className="mb-4 flex flex-row justify-between">
        <div className="mr-4">
          <Avatar size={40} src={workspace.iconUrl ?? undefined}>
            {workspace.name.slice(0, 1).toUpperCase()}
          </Avatar>
        </div>
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AntButton
                type="text"
                icon={<MoreVertical className="size-4" />}
                autoInsertSpace={false}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuItems.map((item) =>
                item.type === "divider" ? (
                  <DropdownMenuSeparator key={item.key} />
                ) : (
                  <DropdownMenuIconItem
                    key={item.key}
                    onSelect={item.onClick}
                    disabled={item.disabled}
                    variant={item.danger ? "destructive" : undefined}
                    icon={item.icon}
                  >
                    {item.label}
                  </DropdownMenuIconItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
          <Avatar.Group
            max={{ count: 3, style: { backgroundColor: "var(--color-primary)", fontSize: 12 } }}
            size="small"
          >
            {workspace.membersPreview.map((member) => (
              <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                {(member.displayName || member.username || "U").slice(0, 1).toUpperCase()}
              </Avatar>
            ))}
          </Avatar.Group>
        )}
        <div onClick={(e) => e.stopPropagation()}>
          <WorkspaceMembersPopover workspace={workspace} />
        </div>
      </div>
    </div>
  );
}
