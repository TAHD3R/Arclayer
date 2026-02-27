import { Avatar, Button as AntButton, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { MoreVertical } from "lucide-react";

import type { OrganizationWorkspace } from "@/types/api";
import { cn } from "@/lib/utils";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { OrganizationWorkspacesTranslateFn } from "../types";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

interface WorkspaceCardProps {
  workspace: OrganizationWorkspace;
  menuItems: MenuProps["items"];
  t: OrganizationWorkspacesTranslateFn;
  onClick?: () => void;
  className?: string;
}

export function WorkspaceCard({ workspace, menuItems, t, onClick, className }: WorkspaceCardProps) {
  return (
    <div
      className={cn(
        "col-span-1 flex cursor-pointer flex-col rounded-lg border border-border bg-accent/50! p-4 shadow-sm!",
        "transition-all! duration-200!",
        "hover:-translate-y-0.5! hover:shadow-md! hover:border-border/80! hover:bg-card!",
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
          <Dropdown
            trigger={["click"]}
            menu={{ items: menuItems }}
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
          >
            <AntButton type="text" icon={<MoreVertical className="size-4" />} />
          </Dropdown>
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
