import type { ColumnDef } from "@tanstack/react-table";
import { Avatar, Button as AntButton, Select, Tag } from "antd";
import { Trash2 } from "lucide-react";

import type { OrgRole, OrganizationMember } from "@/api/organization-members";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const ORG_ROLE_OPTIONS: OrgRole[] = ["owner", "admin", "member"];

type CreateOrganizationMembersColumnsParams = {
  t: Translate;
  roleOptions: Array<{ value: OrgRole; label: string }>;
  roleUpdating: boolean;
  formatDateTime: (value: string | null | undefined) => string;
  onRoleChange: (payload: { memberId: string; role: OrgRole }) => void;
  onRemove: (member: OrganizationMember) => void;
};

function membershipLabel(t: Translate, status: OrganizationMember["status"]): string {
  if (status === "active") return t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE");
  if (status === "invited") return t("team:TEAM_MEMBERSHIP_STATUS_INVITED");
  return t("team:TEAM_MEMBERSHIP_STATUS_DISABLED");
}

export function createOrganizationMembersColumns(
  params: CreateOrganizationMembersColumnsParams,
): Array<ColumnDef<OrganizationMember, unknown>> {
  const { formatDateTime, onRemove, onRoleChange, roleOptions, roleUpdating, t } = params;

  return [
    {
      id: "member",
      meta: { sortKey: "username" },
      header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
      cell: ({ row }) => {
        const member = row.original;
        const primary = member.displayName || member.username;

        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar src={member.avatarUrl ?? undefined}>{primary.slice(0, 1).toUpperCase()}</Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{primary}</div>
              <div className="truncate text-caption text-label-secondary">
                {member.email || "-"}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "role",
      meta: { sortKey: "role_code" },
      header: t("common:ORG_MEMBERS_TABLE_ROLE"),
      cell: ({ row }) => {
        const member = row.original;

        return (
          <Select
            value={member.role}
            className="w-[140px]"
            options={roleOptions}
            onChange={(nextRole) => {
              onRoleChange({
                memberId: member.membershipId,
                role: nextRole as OrgRole,
              });
            }}
            disabled={roleUpdating}
          />
        );
      },
    },
    {
      id: "status",
      meta: { sortKey: "status" },
      header: t("common:ORG_MEMBERS_TABLE_STATUS"),
      cell: ({ row }) => {
        const member = row.original;

        return (
          <Tag color={member.status === "active" ? "green" : "default"} className="!mr-0">
            {membershipLabel(t, member.status)}
          </Tag>
        );
      },
    },
    {
      id: "joined",
      meta: { sortKey: "joined_at" },
      header: t("common:ORG_MEMBERS_TABLE_JOINED_AT"),
      cell: ({ row }) => (
        <span className="text-footnote text-label-secondary">
          {formatDateTime(row.original.joinedAt)}
        </span>
      ),
    },
    {
      id: "lastLogin",
      meta: { sortKey: "last_login_at" },
      header: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
      cell: ({ row }) => (
        <span className="text-footnote text-label-secondary">
          {formatDateTime(row.original.lastLoginAt)}
        </span>
      ),
    },
    {
      id: "actions",
      meta: { kind: "actions" },
      header: t("common:ORG_MEMBERS_TABLE_ACTIONS"),
      cell: ({ row }) => (
        <AntButton
          type="text"
          danger
          icon={<Trash2 className="size-4" />}
          onClick={() => onRemove(row.original)}
        >
          {t("common:DELETE")}
        </AntButton>
      ),
    },
  ];
}
