import type { ReactNode } from "react";
import { Avatar, Button as AntButton, Dropdown, Tag, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { type ColumnDef } from "@tanstack/react-table";
import { Eye, MoreVertical, Trash2, UserCog } from "lucide-react";

import type { OrganizationMember, OrganizationMemberWorkspace } from "@/api/organization-members";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import {
  builtinRoleLabel,
  membershipLabel,
  membershipTagColor,
  roleTagColor,
  userStatusLabel,
  userTagColor,
} from "./members-display";
import { WorkspaceAssociationPopover } from "./workspace-association-popover";
import { type ResolvedMemberWorkspace } from "../shared/organization-member-workspace-list";

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

function buildSelfLeaveLabel(t: TranslateFn): ReactNode {
  return (
    <Tooltip title={t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}>
      <span>{t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")}</span>
    </Tooltip>
  );
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

        const menuItems: NonNullable<MenuProps["items"]> = [
          {
            key: "inspect",
            icon: <Eye className="size-4" />,
            label: t("common:ORG_MEMBERS_ACTION_INSPECT_USER"),
            onClick: () => onInspectMember(item),
          },
          {
            key: "change_role",
            icon: <UserCog className="size-4" />,
            label: t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE"),
            onClick: () => onOpenRoleDialog(item),
          },
          { type: "divider" },
        ];

        if (isCurrentUser) {
          menuItems.push({
            key: "leave",
            icon: <Trash2 className="size-4" />,
            label: isOwnerSelf
              ? buildSelfLeaveLabel(t)
              : t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION"),
            danger: true,
            disabled: isOwnerSelf,
            onClick: () => {
              if (isOwnerSelf) return;
              onOpenRemoveDialog(item);
            },
          });
        } else {
          menuItems.push({
            key: "remove",
            icon: <Trash2 className="size-4" />,
            label: t("common:DELETE"),
            danger: true,
            onClick: () => onOpenRemoveDialog(item),
          });
        }

        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              size={28}
              src={item.avatarUrl ?? undefined}
              className="shrink-0 bg-muted text-foreground"
            >
              {primary.slice(0, 1).toUpperCase()}
            </Avatar>

            <div className="min-w-0">
              <div className="truncate font-medium">{primary}</div>
              <div className="truncate text-xs text-muted-foreground">{secondary}</div>
            </div>

            <div className="ml-auto pl-2">
              <Dropdown
                trigger={["click"]}
                menu={{ items: menuItems }}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                overlayStyle={{ zIndex: 1400 }}
              >
                <AntButton
                  type="text"
                  className="h-8! w-8! p-0!"
                  icon={<MoreVertical className="size-4" />}
                  aria-label={t("team:TEAM_USER_ACTIONS")}
                />
              </Dropdown>
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
      id: "status",
      meta: { sortKey: "status" },
      header: t("common:ORG_MEMBERS_TABLE_STATUS"),
      cell: ({ row }) => {
        const item = row.original;

        return (
          <div className="flex flex-wrap gap-1">
            <Tag color={membershipTagColor(item.status)} className="mr-0!">
              {membershipLabel(t, item.status)}
            </Tag>
            <Tag color={userTagColor(item.userStatus)} className="mr-0!">
              {userStatusLabel(t, item.userStatus)}
            </Tag>
          </div>
        );
      },
    },
    {
      id: "role",
      meta: { sortKey: "role_code" },
      header: t("common:ORG_MEMBERS_TABLE_ROLE"),
      cell: ({ row }) => (
        <Tag color={roleTagColor(row.original.role)} className="mr-0!">
          {roleNameByCode.get(row.original.roleCode) || builtinRoleLabel(t, row.original.role)}
        </Tag>
      ),
    },
    {
      id: "lastLogin",
      meta: { sortKey: "last_login_at" },
      header: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
      cell: ({ row }) => <span>{formatDateTime(row.original.lastLoginAt)}</span>,
    },
  ];
}
