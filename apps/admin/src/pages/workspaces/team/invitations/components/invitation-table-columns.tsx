import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Ellipsis, Link2Off, RotateCcw, Users } from "lucide-react";

import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { BaseTag, InvitationStatusTag } from "@/components/ui/tags";
import type { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { buildInvitationUserDetails } from "@/pages/workspaces/team/shared/components/invitation-user-details";
import { InvitationUserLabel } from "@/pages/workspaces/team/shared/components/invitation-user-label";
import { InviteLinkParticipantsPopover } from "@/pages/workspaces/team/shared/components/invite-link-participants-popover";
import type { TeamInvitation, TeamInviteLink } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

type Translate = (key: string, values?: Record<string, unknown>) => string;
type AdminDateTimeFormatter = ReturnType<typeof useAdminDateTimeFormatter>;

type SharedOptions = {
  t: Translate;
  dateTime: AdminDateTimeFormatter;
  roleNameByCode: ReadonlyMap<string, string>;
};

function roleName(roleCode: string | null | undefined, names: ReadonlyMap<string, string>) {
  return roleCode ? (names.get(roleCode) ?? roleCode) : null;
}

function invitationStatusLabel(t: Translate, status: TeamInvitation["status"]) {
  if (status === "pending") return t("team:TEAM_INVITATION_STATUS_PENDING");
  if (status === "accepted") return t("team:TEAM_INVITATION_STATUS_ACCEPTED");
  if (status === "revoked") return t("team:TEAM_INVITATION_STATUS_REVOKED");
  return t("team:TEAM_INVITATION_STATUS_EXPIRED");
}

function selectionColumn(t: Translate): ColumnDef<TeamInvitation, unknown> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    meta: { title: "", kind: "select", headerAlign: "center", pin: "left" },
    header: ({ table }) => (
      <div className="flex w-full items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          aria-label={t("team:TEAM_INVITATIONS_SELECT_ALL")}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex w-full items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          aria-label={t("team:TEAM_INVITATIONS_SELECT_ROW", { email: row.original.email })}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
        />
      </div>
    ),
    size: 52,
    minSize: 52,
  };
}

export function createPendingInvitationColumns(
  options: SharedOptions & {
    mutating: boolean;
    onRenew: (invitation: TeamInvitation) => void;
    onRevoke: (invitation: TeamInvitation) => void;
  },
): ColumnDef<TeamInvitation, unknown>[] {
  return [
    selectionColumn(options.t),
    {
      id: "invitee",
      header: options.t("team:TEAM_INVITATIONS_COL_EMAIL"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_EMAIL"), kind: "primary" },
      cell: ({ row }) => {
        const role = roleName(row.original.roleCode, options.roleNameByCode);
        return (
          <div className="min-w-0">
            <span className="block truncate font-medium" title={row.original.email}>
              {row.original.email}
            </span>
            <span className="block truncate text-caption text-label-secondary">{role ?? "-"}</span>
          </div>
        );
      },
      size: 260,
      minSize: 210,
    },
    {
      id: "inviter",
      header: options.t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
      meta: { title: options.t("team:TEAM_INVITE_LINKS_COL_CREATOR"), kind: "meta" },
      cell: ({ row }) => (
        <InvitationUserLabel
          user={row.original.createdBy}
          roleLabel={roleName(row.original.roleCode, options.roleNameByCode)}
          status={row.original.status}
          statusLabel={invitationStatusLabel(options.t, row.original.status)}
          details={buildInvitationUserDetails({
            t: options.t,
            dateTime: options.dateTime,
            inviteeEmail: row.original.email,
            createdAt: row.original.createdAt,
            expiresAt: row.original.expiresAt,
          })}
        />
      ),
      size: 220,
    },
    {
      id: "status",
      header: options.t("team:TEAM_INVITATIONS_COL_STATUS"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_STATUS"), kind: "meta" },
      cell: ({ row }) => (
        <InvitationStatusTag
          status={row.original.status}
          label={invitationStatusLabel(options.t, row.original.status)}
        />
      ),
      size: 110,
    },
    {
      id: "createdAt",
      header: options.t("team:TEAM_INVITATIONS_COL_CREATED"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_CREATED"), kind: "meta" },
      cell: ({ row }) => options.dateTime.formatDateTime(row.original.createdAt),
      size: 170,
    },
    {
      id: "expiresAt",
      header: options.t("team:TEAM_INVITATIONS_COL_EXPIRES"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_EXPIRES"), kind: "meta" },
      cell: ({ row }) =>
        row.original.expiresAt
          ? options.dateTime.formatDateTime(row.original.expiresAt)
          : options.t("team:TEAM_INVITATIONS_NEVER_EXPIRES"),
      size: 170,
    },
    {
      id: "actions",
      header: "",
      meta: buildDataTableActionsColumnMeta("right", "right"),
      enableHiding: false,
      cell: ({ row }) => (
        <DataTableActionsCell>
          <Button
            variant="ghost"
            size="sm"
            disabled={options.mutating || row.original.status !== "pending"}
            onClick={() => options.onRenew(row.original)}
          >
            <RotateCcw className="size-4" />
            {options.t("team:TEAM_ACTION_RENEW")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={options.t("team:TEAM_INVITATIONS_ACTION_MORE")}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuIconItem
                icon={<Link2Off className="size-4" />}
                variant="destructive"
                disabled={options.mutating || row.original.status !== "pending"}
                onSelect={() => options.onRevoke(row.original)}
              >
                {options.t("team:TEAM_INVITATIONS_ACTION_REVOKE")}
              </DropdownMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DataTableActionsCell>
      ),
      size: 180,
    },
  ];
}

export function createAcceptedInvitationColumns(
  options: SharedOptions & { onOpenMembers: () => void },
): ColumnDef<TeamInvitation, unknown>[] {
  return [
    {
      id: "member",
      header: options.t("common:ORG_MEMBERS_TABLE_MEMBER"),
      meta: { title: options.t("common:ORG_MEMBERS_TABLE_MEMBER"), kind: "primary" },
      cell: ({ row }) => (
        <InvitationUserLabel
          user={row.original.acceptedBy}
          roleLabel={roleName(row.original.roleCode, options.roleNameByCode)}
          status={row.original.status}
          statusLabel={invitationStatusLabel(options.t, row.original.status)}
          details={buildInvitationUserDetails({
            t: options.t,
            dateTime: options.dateTime,
            inviteeEmail: row.original.email,
            createdAt: row.original.createdAt,
            expiresAt: row.original.expiresAt,
            processedAt: row.original.acceptedAt,
            processedAtLabel: options.t("team:TEAM_INVITATIONS_COL_ACCEPTED"),
          })}
        />
      ),
      size: 260,
      minSize: 220,
    },
    {
      id: "role",
      header: options.t("team:TEAM_INVITATIONS_COL_ROLE"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_ROLE"), kind: "meta" },
      cell: ({ row }) => roleName(row.original.roleCode, options.roleNameByCode) ?? "-",
      size: 150,
    },
    {
      id: "inviter",
      header: options.t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
      meta: { title: options.t("team:TEAM_INVITE_LINKS_COL_CREATOR"), kind: "meta" },
      cell: ({ row }) => <InvitationUserLabel user={row.original.createdBy} />,
      size: 220,
    },
    {
      id: "acceptedAt",
      header: options.t("team:TEAM_INVITATIONS_COL_ACCEPTED"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_ACCEPTED"), kind: "meta" },
      cell: ({ row }) =>
        row.original.acceptedAt ? options.dateTime.formatDateTime(row.original.acceptedAt) : "-",
      size: 180,
    },
    {
      id: "source",
      header: options.t("team:TEAM_INVITATIONS_COL_SOURCE"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_SOURCE"), kind: "meta" },
      cell: () => <BaseTag>{options.t("team:TEAM_INVITATIONS_SOURCE_EMAIL")}</BaseTag>,
      size: 120,
    },
    {
      id: "actions",
      header: "",
      meta: buildDataTableActionsColumnMeta("right", "right"),
      enableHiding: false,
      cell: () => (
        <DataTableActionsCell>
          <Button variant="ghost" size="sm" onClick={options.onOpenMembers}>
            <Users className="size-4" />
            {options.t("team:TEAM_INVITATIONS_ACTION_VIEW_MEMBER")}
          </Button>
        </DataTableActionsCell>
      ),
      size: 160,
    },
  ];
}

function linkStatus(link: TeamInviteLink): "active" | "disabled" | "expired" | "exhausted" {
  if (link.disabledAt) return "disabled";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return "expired";
  if (link.maxUses != null && Number(link.usesCount ?? 0) >= link.maxUses) return "exhausted";
  return "active";
}

export function createInviteLinkColumns(
  options: SharedOptions & {
    workspaceId: string;
    ephemeralInviteUrlByLinkId: Readonly<Record<string, string>>;
    mutating: boolean;
    onRenew: (link: TeamInviteLink) => void;
    onDisable: (link: TeamInviteLink) => void;
    onCopy: (url: string) => void;
  },
): ColumnDef<TeamInviteLink, unknown>[] {
  return [
    {
      id: "link",
      header: options.t("team:TEAM_INVITE_LINKS_COL_CODE"),
      meta: { title: options.t("team:TEAM_INVITE_LINKS_COL_CODE"), kind: "primary" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="block truncate font-mono text-footnote">{row.original.displayCode}</span>
          <span className="block truncate text-caption text-label-secondary">
            {roleName(row.original.roleCode, options.roleNameByCode) ?? "-"}
          </span>
        </div>
      ),
      size: 220,
    },
    {
      id: "status",
      header: options.t("team:TEAM_INVITATIONS_COL_STATUS"),
      meta: { title: options.t("team:TEAM_INVITATIONS_COL_STATUS"), kind: "meta" },
      cell: ({ row }) => {
        const status = linkStatus(row.original);
        return (
          <BaseTag
            color={status === "active" ? "green" : status === "expired" ? "gold" : "default"}
          >
            {options.t(`team:TEAM_INVITE_LINK_STATUS_${status.toUpperCase()}`)}
          </BaseTag>
        );
      },
      size: 120,
    },
    {
      id: "usage",
      header: options.t("team:TEAM_INVITE_LINKS_COL_USAGE"),
      meta: { title: options.t("team:TEAM_INVITE_LINKS_COL_USAGE"), kind: "meta" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums">
            {Number(row.original.usesCount ?? 0)}/{row.original.maxUses ?? "∞"}
          </span>
          {Number(row.original.usesCount ?? 0) > 0 ? (
            <InviteLinkParticipantsPopover
              workspaceId={options.workspaceId}
              linkId={row.original.id}
              usesCount={Number(row.original.usesCount ?? 0)}
              primaryUser={row.original.recentParticipants?.[0]?.user ?? row.original.lastUsedBy}
              lastUsedAt={row.original.lastUsedAt}
            />
          ) : null}
        </div>
      ),
      size: 180,
    },
    {
      id: "creator",
      header: options.t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
      meta: { title: options.t("team:TEAM_INVITE_LINKS_COL_CREATOR"), kind: "meta" },
      cell: ({ row }) => <InvitationUserLabel user={row.original.createdBy} />,
      size: 220,
    },
    {
      id: "expiresAt",
      header: options.t("team:TEAM_INVITE_LINKS_COL_EXPIRES"),
      meta: { title: options.t("team:TEAM_INVITE_LINKS_COL_EXPIRES"), kind: "meta" },
      cell: ({ row }) =>
        row.original.expiresAt
          ? options.dateTime.formatDateTime(row.original.expiresAt)
          : options.t("team:TEAM_INVITATIONS_NEVER_EXPIRES"),
      size: 180,
    },
    {
      id: "updatedAt",
      header: options.t("team:TEAM_INVITE_LINKS_COL_UPDATED"),
      meta: { title: options.t("team:TEAM_INVITE_LINKS_COL_UPDATED"), kind: "meta" },
      cell: ({ row }) => options.dateTime.formatDateTime(row.original.updatedAt),
      size: 180,
    },
    {
      id: "actions",
      header: "",
      meta: buildDataTableActionsColumnMeta("right", "right"),
      enableHiding: false,
      cell: ({ row }) => {
        const url = options.ephemeralInviteUrlByLinkId[row.original.id];
        const isActive = linkStatus(row.original) === "active";
        return (
          <DataTableActionsCell>
            <Button
              variant="ghost"
              size="sm"
              disabled={options.mutating || !isActive}
              onClick={() => options.onRenew(row.original)}
            >
              <RotateCcw className="size-4" />
              {options.t("team:TEAM_ACTION_RENEW")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={options.t("team:TEAM_INVITATIONS_ACTION_MORE")}
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuIconItem
                  icon={<Copy className="size-4" />}
                  disabled={!url}
                  onSelect={() => (url ? options.onCopy(url) : undefined)}
                >
                  {url
                    ? options.t("team:TEAM_INVITE_LINKS_ACTION_COPY_LINK")
                    : options.t("team:TEAM_INVITE_LINKS_ACTION_ROTATE_TO_COPY")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<Link2Off className="size-4" />}
                  variant="destructive"
                  disabled={options.mutating || !isActive}
                  onSelect={() => options.onDisable(row.original)}
                >
                  {options.t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
                </DropdownMenuIconItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </DataTableActionsCell>
        );
      },
      size: 180,
    },
  ];
}
