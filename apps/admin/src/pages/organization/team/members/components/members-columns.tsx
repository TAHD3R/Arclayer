import { type ColumnDef } from "@tanstack/react-table";
import { Eye, MoreVertical, Trash2, UserCog } from "lucide-react";

import { Button } from "@celestial/ui/button";
import { MemberIdentityCell } from "@/pages/_shared/team/components/member-identity-cell";
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
import { membershipLabel, userStatusLabel } from "../utils";
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
      meta: {
        title: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        sortKey: "username",
      },
      header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
      cell: ({ row }) => {
        const item = row.original;
        const isCurrentUser = currentUserId !== null && item.userId === currentUserId;
        const isOwnerSelf = item.role === "owner" && isCurrentUser;

        return (
          <div className="flex min-w-0 items-center gap-3">
            <MemberIdentityCell
              member={item}
              scopeLabel={t("common:ORG_MEMBERS_CONTEXT_SCOPE")}
              scopeVariant="organization"
              badges={
                <>
                  <OrgRoleTag
                    role={item.role}
                    className="!mr-0 max-w-full overflow-hidden"
                    label={
                      <span className="truncate">
                        {roleNameByCode.get(item.roleCode) || item.roleCode}
                      </span>
                    }
                  />
                  <OrgUserStatusTag
                    status={item.userStatus}
                    className="!mr-0 max-w-full overflow-hidden"
                    label={<span className="truncate">{userStatusLabel(t, item.userStatus)}</span>}
                  />
                </>
              }
              description={t("common:ORG_MEMBERS_CONTEXT_HOVER_SUMMARY", {
                workspaceCount: item.workspaceCount,
              })}
              onOpenDetails={() => onInspectMember(item)}
              className="min-w-0 flex-1"
            />

            <div className="ml-auto pl-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-8 w-8 p-0"
                    aria-label={t("team:TEAM_USER_ACTIONS")}
                  >
                    <MoreVertical className="size-4" />
                  </Button>
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
      meta: {
        title: t("common:ORG_MEMBERS_TABLE_WORKSPACES"),
        sortKey: "workspace_count",
        defaultHidden: true,
      },
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
      meta: {
        title: t("common:ORG_MEMBERS_TABLE_ROLE"),
        sortKey: "role_code",
      },
      header: t("common:ORG_MEMBERS_TABLE_ROLE"),
      cell: ({ row }) => (
        <OrgRoleTag
          role={row.original.role}
          className="mr-0!"
          label={roleNameByCode.get(row.original.roleCode) || row.original.roleCode}
        />
      ),
    },
    {
      id: "status",
      meta: {
        title: t("common:ORG_MEMBERS_TABLE_STATUS"),
        sortKey: "status",
      },
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
      meta: {
        title: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
        sortKey: "last_login_at",
        defaultHidden: true,
      },
      header: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
      cell: ({ row }) => <span>{formatDateTime(row.original.lastLoginAt)}</span>,
    },
  ];
}
