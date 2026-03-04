import { Avatar, Button as AntButton } from "antd";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, MoreVertical, Trash2, UserCog } from "lucide-react";

import type { OrganizationMember, OrganizationMemberWorkspace } from "@/types/api";
import { OrgMembershipStatusTag, OrgRoleTag, OrgUserStatusTag } from "@/components/ui/tags";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
} from "@celestial/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@celestial/ui/tooltip";
import { builtinRoleLabel, membershipLabel, userStatusLabel } from "../utils";
import { WorkspaceAssociationPopover } from "./workspace-association-popover";
import { type ResolvedMemberWorkspace } from "../../shared/components/organization-member-workspace-list";

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

interface CreateOrganizationMemberColumnsParams {
  t: TranslateFn;
  currentUserId: string | null;
  formatDateTime: (value: string | null | undefined) => string;
  roleNameByCode: Map<string, string>;
  resolveWorkspaces: (workspaces: OrganizationMemberWorkspace[]) => ResolvedMemberWorkspace[];
  onInspectMember: (member: OrganizationMember) => void;
  onOpenRoleDialog: (member: OrganizationMember) => void;
  onOpenRemoveDialog: (member: OrganizationMember) => void;
  onEnterWorkspace: (workspaceId: string) => void;
}

export function createOrganizationMemberColumns({
  t,
  currentUserId,
  formatDateTime,
  roleNameByCode,
  resolveWorkspaces,
  onInspectMember,
  onOpenRoleDialog,
  onOpenRemoveDialog,
  onEnterWorkspace,
}: CreateOrganizationMemberColumnsParams): Array<ColumnDef<OrganizationMember, unknown>> {
  return [
    {
      id: "member",
      meta: { sortKey: "username" },
      header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
      cell: ({ row }) => {
        const item = row.original;
        const primary = item.displayName || item.username;
        const secondary = item.email || "-";
        const isCurrentUser = currentUserId !== null && item.userId === currentUserId;
        const isOwnerSelf = item.role === "owner" && isCurrentUser;

        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size={28} src={item.avatarUrl ?? undefined} className="shrink-0">
              {primary.slice(0, 1).toUpperCase()}
            </Avatar>

            <div className="min-w-0">
              <div className="truncate font-medium">{primary}</div>
              <div className="truncate text-caption text-label-secondary">{secondary}</div>
            </div>

            <div className="ml-auto pl-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <AntButton
                    type="text"
                    className="h-8! w-8! p-0!"
                    icon={<MoreVertical className="size-4" />}
                    aria-label={t("team:TEAM_USER_ACTIONS")}
                    autoInsertSpace={false}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuIconItem
                    icon={<Eye className="size-4" />}
                    onSelect={() => onInspectMember(item)}
                  >
                    {t("common:ORG_MEMBERS_ACTION_INSPECT_USER")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={<UserCog className="size-4" />}
                    onSelect={() => onOpenRoleDialog(item)}
                  >
                    {t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE")}
                  </DropdownMenuIconItem>
                  <DropdownMenuSeparator />
                  {isCurrentUser ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuIconItem
                          icon={<Trash2 className="size-4" />}
                          variant="destructive"
                          disabled={isOwnerSelf}
                          onSelect={() => {
                            if (isOwnerSelf) return;
                            onOpenRemoveDialog(item);
                          }}
                        >
                          {t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")}
                        </DropdownMenuIconItem>
                      </TooltipTrigger>
                      {isOwnerSelf && (
                        <TooltipContent>
                          {t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  ) : (
                    <DropdownMenuIconItem
                      icon={<Trash2 className="size-4" />}
                      variant="destructive"
                      onSelect={() => onOpenRemoveDialog(item)}
                    >
                      {t("common:DELETE")}
                    </DropdownMenuIconItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      },
    },
    {
      id: "workspaces",
      meta: { sortKey: "workspace_count" },
      header: t("common:ORG_MEMBERS_TABLE_WORKSPACES"),
      cell: ({ row }) => (
        <WorkspaceAssociationPopover
          workspaces={resolveWorkspaces(row.original.workspaces)}
          roleNameByCode={roleNameByCode}
          onEnterWorkspace={onEnterWorkspace}
        />
      ),
    },
    {
      id: "role",
      meta: { sortKey: "role_code" },
      header: t("common:ORG_MEMBERS_TABLE_ROLE"),
      cell: ({ row }) => (
        <OrgRoleTag
          role={row.original.role}
          className="mr-0!"
          label={
            roleNameByCode.get(row.original.roleCode) || builtinRoleLabel(t, row.original.role)
          }
        />
      ),
    },
    {
      id: "status",
      meta: { sortKey: "status" },
      header: t("common:ORG_MEMBERS_TABLE_STATUS"),
      cell: ({ row }) => {
        const item = row.original;
        const isNormal = item.status === "active" && item.userStatus === "active";

        return (
          <div className="flex flex-wrap gap-1">
            <OrgMembershipStatusTag
              status={item.status}
              className="mr-0!"
              label={membershipLabel(t, item.status)}
            />
            {!isNormal && (
              <OrgUserStatusTag
                status={item.userStatus}
                className="mr-0!"
                label={userStatusLabel(t, item.userStatus)}
              />
            )}
          </div>
        );
      },
    },
    {
      id: "lastLogin",
      meta: { sortKey: "last_login_at" },
      header: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
      cell: ({ row }) => <span>{formatDateTime(row.original.lastLoginAt)}</span>,
    },
  ];
}
