import { useCallback, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button as AntButton, Tag } from "antd";
import { Link2Off, RotateCcw } from "lucide-react";

import {
  type OrganizationInvitation,
  type OrganizationInviteLink,
} from "@/api/organization-members";
import { renderUserLabel } from "@/pages/workspaces/team/invitations/invitations-helpers";

import { toStatusTagColor } from "./invitations-constants";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type DateFormatterLike = {
  formatDate: (
    iso: string | null | undefined,
    options?: { emptyValue?: string; invalidValue?: string },
  ) => string;
};

interface UseOrganizationInvitationColumnsOptions {
  t: TranslateFn;
  dateTime: DateFormatterLike;
  roleNameByCode: Map<string, string>;
  onOpenRenewInvitation: (invitation: OrganizationInvitation) => void;
  onOpenRevokeInvitation: (invitation: OrganizationInvitation) => void;
  onOpenRenewLink: (link: OrganizationInviteLink) => void;
  onOpenDisableLink: (link: OrganizationInviteLink) => void;
  onCopyLinkText: (text: string) => void;
}

export function useOrganizationInvitationColumns(options: UseOrganizationInvitationColumnsOptions) {
  const {
    t,
    dateTime,
    roleNameByCode,
    onOpenRenewInvitation,
    onOpenRevokeInvitation,
    onOpenRenewLink,
    onOpenDisableLink,
    onCopyLinkText,
  } = options;

  const invitationStatusLabel = useCallback(
    (status: OrganizationInvitation["status"]): string => {
      if (status === "accepted") return t("team:TEAM_INVITATION_STATUS_ACCEPTED");
      if (status === "revoked") return t("team:TEAM_INVITATION_STATUS_REVOKED");
      if (status === "expired") return t("team:TEAM_INVITATION_STATUS_EXPIRED");
      return t("team:TEAM_INVITATION_STATUS_PENDING");
    },
    [t],
  );

  const pendingColumns = useMemo<Array<ColumnDef<OrganizationInvitation, unknown>>>(
    () => [
      {
        id: "email",
        meta: { sortKey: "email" },
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => <span>{row.original.email || "-"}</span>,
      },
      {
        id: "inviter",
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        id: "role",
        meta: { sortKey: "role_code" },
        header: t("team:TEAM_INVITATIONS_COL_ROLE"),
        cell: ({ row }) => (
          <Tag className="mr-0!">
            {roleNameByCode.get(row.original.roleCode) || row.original.roleCode}
          </Tag>
        ),
      },
      {
        id: "status",
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <Tag color={toStatusTagColor(status)}>{invitationStatusLabel(status)}</Tag>;
        },
      },
      {
        id: "createdAt",
        meta: { sortKey: "created_at" },
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>
          );
        },
      },
      {
        id: "expiresAt",
        meta: { sortKey: "expires_at" },
        header: t("team:TEAM_INVITATIONS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.expiresAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        id: "actions",
        meta: { kind: "actions" },
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <AntButton
              type="text"
              icon={<RotateCcw className="size-4" />}
              onClick={() => onOpenRenewInvitation(row.original)}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
            <AntButton type="text" danger onClick={() => onOpenRevokeInvitation(row.original)}>
              {t("team:TEAM_ACTION_DELETE")}
            </AntButton>
          </div>
        ),
      },
    ],
    [
      dateTime,
      invitationStatusLabel,
      onOpenRenewInvitation,
      onOpenRevokeInvitation,
      roleNameByCode,
      t,
    ],
  );

  const processedColumns = useMemo<Array<ColumnDef<OrganizationInvitation, unknown>>>(
    () => [
      {
        id: "invitee",
        meta: { sortKey: "email" },
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => <span>{row.original.email || "-"}</span>,
      },
      {
        id: "role",
        meta: { sortKey: "role_code" },
        header: t("team:TEAM_INVITATIONS_COL_ROLE"),
        cell: ({ row }) => (
          <span>{roleNameByCode.get(row.original.roleCode) || row.original.roleCode}</span>
        ),
      },
      {
        id: "status",
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <Tag color={toStatusTagColor(status)}>{invitationStatusLabel(status)}</Tag>;
        },
      },
      {
        id: "processedBy",
        header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        cell: ({ row }) => (
          <span>
            {row.original.acceptedBy?.displayName ||
              row.original.acceptedBy?.username ||
              row.original.revokedBy?.displayName ||
              row.original.revokedBy?.username ||
              "-"}
          </span>
        ),
      },
      {
        id: "processedAt",
        header: t("team:TEAM_INVITATIONS_COL_ACCEPTED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.acceptedAt || row.original.revokedAt, {
            emptyValue: "",
          });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>
          );
        },
      },
      {
        id: "createdAt",
        meta: { sortKey: "created_at" },
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>
          );
        },
      },
    ],
    [dateTime, invitationStatusLabel, roleNameByCode, t],
  );

  const linkColumns = useMemo<Array<ColumnDef<OrganizationInviteLink, unknown>>>(
    () => [
      {
        id: "creator",
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        id: "code",
        meta: { sortKey: "display_code" },
        header: t("team:TEAM_INVITE_LINKS_COL_CODE"),
        cell: ({ row }) => {
          const text = row.original.inviteUrl || row.original.displayCode;
          return (
            <AntButton
              type="link"
              className="font-mono"
              onClick={() => onCopyLinkText(text)}
            >
              {row.original.displayCode}
            </AntButton>
          );
        },
      },
      {
        id: "participant",
        meta: { sortKey: "uses_count" },
        header: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT"),
        cell: ({ row }) => {
          const uses = Number(row.original.usesCount || 0);
          const latestParticipant =
            row.original.lastUsedBy?.displayName ||
            row.original.lastUsedBy?.username ||
            row.original.lastUsedBy?.email ||
            null;

          return (
            <div className="min-w-0">
              <div className="font-medium">{uses}</div>
              {latestParticipant ? (
                <div className="truncate text-xs text-muted-foreground">{latestParticipant}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "createdAt",
        meta: { sortKey: "created_at" },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>
          );
        },
      },
      {
        id: "expiresAt",
        meta: { sortKey: "expires_at" },
        header: t("team:TEAM_INVITE_LINKS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.expiresAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        id: "actions",
        meta: { kind: "actions" },
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <AntButton
              type="text"
              icon={<RotateCcw className="size-4" />}
              onClick={() => onOpenRenewLink(row.original)}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
            <AntButton
              type="text"
              danger
              icon={<Link2Off className="size-4" />}
              onClick={() => onOpenDisableLink(row.original)}
            >
              {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
            </AntButton>
          </div>
        ),
      },
    ],
    [dateTime, onCopyLinkText, onOpenDisableLink, onOpenRenewLink, t],
  );

  return {
    pendingColumns,
    processedColumns,
    linkColumns,
  };
}
