import { useCallback, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Link2Off, RotateCcw } from "lucide-react";

import { Button } from "@arclayer/ui/button";
import type { OrganizationInvitation, OrganizationInviteLink } from "@/types/api";
import { InviteLinkParticipantsPopover } from "@/pages/_shared/team/components/invite-link-participants-popover";
import { renderUserLabel } from "@/pages/_shared/team/components/user-label";
import { InvitationRoleTag, InvitationStatusTag } from "@/components/ui/tags";

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
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_EMAIL"),
          sortKey: "email",
        },
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => {
          const inv = row.original;
          const roleCode = inv.roleCode || null;
          const roleName = roleCode ? (roleNameByCode.get(roleCode) ?? roleCode) : null;
          return (
            <div className="min-w-0">
              <div className="font-medium truncate">{inv.email || "-"}</div>
              <div className="mt-1">
                <InvitationRoleTag label={roleName || t("common:NA")} />
              </div>
            </div>
          );
        },
      },
      {
        id: "inviter",
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
          defaultHidden: true,
        },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        id: "status",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_STATUS"),
          sortKey: "status",
        },
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <InvitationStatusTag status={status} label={invitationStatusLabel(status)} />;
        },
      },
      {
        id: "createdAt",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_CREATED"),
          sortKey: "created_at",
        },
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          const datetime = formatted || "-";
          return (
            <span className={formatted ? "" : "text-label-secondary"}>
              {t("team:TEAM_INVITATIONS_SENT_AT", { datetime })}
            </span>
          );
        },
      },
      {
        id: "expiresAt",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_EXPIRES"),
          sortKey: "expires_at",
        },
        header: t("team:TEAM_INVITATIONS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.expiresAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-label-secondary"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        size: 220,
        meta: {
          title: t("team:TEAM_TABLE_COL_ACTIONS"),
          kind: "actions",
        },
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenRenewInvitation(row.original)}>
              <RotateCcw className="size-4" />
              {t("team:TEAM_ACTION_RENEW")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onOpenRevokeInvitation(row.original)}
            >
              {t("team:TEAM_ACTION_DELETE")}
            </Button>
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
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_EMAIL"),
          sortKey: "email",
        },
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => <span>{row.original.email || "-"}</span>,
      },
      {
        id: "role",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_ROLE"),
          sortKey: "role_code",
        },
        header: t("team:TEAM_INVITATIONS_COL_ROLE"),
        cell: ({ row }) => (
          <span>{roleNameByCode.get(row.original.roleCode) || row.original.roleCode}</span>
        ),
      },
      {
        id: "status",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_STATUS"),
          sortKey: "status",
        },
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <InvitationStatusTag status={status} label={invitationStatusLabel(status)} />;
        },
      },
      {
        id: "processedBy",
        meta: {
          title: t("common:ORG_MEMBERS_TABLE_MEMBER"),
          defaultHidden: true,
        },
        header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        cell: ({ row }) => renderUserLabel(row.original.acceptedBy ?? row.original.revokedBy),
      },
      {
        id: "processedAt",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_ACCEPTED"),
          defaultHidden: true,
        },
        header: t("team:TEAM_INVITATIONS_COL_ACCEPTED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.acceptedAt || row.original.revokedAt, {
            emptyValue: "",
          });
          return (
            <span className={formatted ? "" : "text-label-secondary"}>{formatted || "-"}</span>
          );
        },
      },
      {
        id: "createdAt",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_CREATED"),
          sortKey: "created_at",
        },
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-label-secondary"}>{formatted || "-"}</span>
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
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
          defaultHidden: true,
        },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        id: "code",
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_CODE"),
          sortKey: "display_code",
        },
        header: t("team:TEAM_INVITE_LINKS_COL_CODE"),
        cell: ({ row }) => {
          const text = row.original.inviteUrl || row.original.displayCode;
          return (
            <Button variant="link" className="font-mono" onClick={() => onCopyLinkText(text)}>
              {row.original.displayCode}
            </Button>
          );
        },
      },
      {
        id: "participant",
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT"),
          sortKey: "uses_count",
        },
        header: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT"),
        cell: ({ row }) => {
          const uses = Number(row.original.usesCount || 0);
          const primaryUser = row.original.lastUsedBy ?? null;
          return (
            <InviteLinkParticipantsPopover
              scope="organization"
              linkId={row.original.id}
              usesCount={uses}
              primaryUser={primaryUser}
            />
          );
        },
      },
      {
        id: "createdAt",
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_CREATED"),
          sortKey: "created_at",
        },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          const datetime = formatted || "-";
          return (
            <span className={formatted ? "" : "text-label-secondary"}>
              {t("team:TEAM_INVITATIONS_SENT_AT", { datetime })}
            </span>
          );
        },
      },
      {
        id: "expiresAt",
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_EXPIRES"),
          sortKey: "expires_at",
        },
        header: t("team:TEAM_INVITE_LINKS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.expiresAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-label-secondary"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        size: 220,
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_ACTIONS"),
          kind: "actions",
        },
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenRenewLink(row.original)}>
              <RotateCcw className="size-4" />
              {t("team:TEAM_ACTION_RENEW")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onOpenDisableLink(row.original)}
            >
              <Link2Off className="size-4" />
              {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
            </Button>
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
