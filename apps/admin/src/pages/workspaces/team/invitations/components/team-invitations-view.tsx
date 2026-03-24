"use client";
import { Link2Off, Plus, RotateCcw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyWorkspaces } from "@/api/workspaces";
import { listWorkspaceRoles } from "@/api/rbac";
import {
  disableTeamInviteLink,
  deleteTeamInvitation,
  listTeamInvitations,
  listTeamInviteLinks,
  renewTeamInvitation,
  renewTeamInviteLink,
} from "@/api/team";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import type { TeamInvitation, TeamInviteLink } from "@/types/api";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import {
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";
import { Button } from "@arclayer/ui/button";
import { ChromeTabs, ChromeTabsContent } from "@arclayer/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { TeamInvitationsPageExtra } from "@/pages/workspaces/team/shared/components/team-invitations-page-extra";
import { InviteMembersDialog } from "@/pages/workspaces/team/shared/components/invite-members-dialog";
import { InviteLinkParticipantsPopover } from "@/pages/workspaces/team/shared/components/invite-link-participants-popover";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import type { RenewExpiresInSeconds, TabKey } from "../types";
import { TeamInvitationsTableSection } from "@/pages/workspaces/team/shared/components/team-invitations-table-section";
import { TeamInvitationsDialogs } from "./invitations-dialogs";
import { InvitationRoleTag, InvitationStatusTag } from "@/components/ui/tags";
import { InvitationUserLabel } from "@/pages/workspaces/team/shared/components/invitation-user-label";
import { buildInvitationUserDetails } from "@/pages/workspaces/team/shared/components/invitation-user-details";

export function TeamInvitationsView(props: { workspaceIdOverride?: string | null } = {}) {
  const { t } = useTranslation(["team", "nav", "common"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceId = props.workspaceIdOverride ?? workspaceIdFromStore;
  const dateTime = useWorkspaceDateTimeFormatter();
  const [tab, setTab] = React.useState<TabKey>("pending");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmailOpen, setInviteEmailOpen] = React.useState(false);
  const [deleteInvitation, setDeleteInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewInvitation, setRenewInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewLink, setRenewLink] = React.useState<TeamInviteLink | null>(null);
  const [renewExpiresInSeconds, setRenewExpiresInSeconds] = React.useState<RenewExpiresInSeconds>(
    7 * 24 * 60 * 60,
  );
  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const workspaceName = React.useMemo(() => {
    const items = workspacesQuery.data?.items ?? [];
    const found = workspaceId
      ? items.find((w) => String(w.workspaceId) === String(workspaceId))
      : undefined;
    return found?.name || t("team:TEAM_WORKSPACE_FALLBACK");
  }, [t, workspaceId, workspacesQuery.data?.items]);
  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles", "list", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceRoles(String(workspaceId), { size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const roleNameByCode = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rolesQuery.data?.items ?? []) {
      map.set(r.code, r.name || r.code);
    }
    return map;
  }, [rolesQuery.data?.items]);
  const disableLinkMutation = useMutation({
    mutationFn: async (linkId: string) =>
      workspaceId
        ? disableTeamInviteLink(String(workspaceId), linkId)
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: [
          "dataTable",
          workspaceId ? `team-invite-links:${workspaceId}` : "team-invite-links",
        ],
      });
    },
    onError: (err) => notifyError(err),
  });
  const renewLinkMutation = useMutation({
    mutationFn: async (payload: { linkId: string; expiresInSeconds: number | null }) =>
      workspaceId
        ? renewTeamInviteLink(String(workspaceId), payload.linkId, {
            expiresInSeconds: payload.expiresInSeconds,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: [
          "dataTable",
          workspaceId ? `team-invite-links:${workspaceId}` : "team-invite-links",
        ],
      });
      setRenewLink(null);
    },
    onError: (err) => notifyError(err),
  });
  const renewInvitationMutation = useMutation({
    mutationFn: async (payload: { invitationId: string; expiresInSeconds: number | null }) =>
      workspaceId
        ? renewTeamInvitation(String(workspaceId), payload.invitationId, {
            expiresInSeconds: payload.expiresInSeconds,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: [
          "dataTable",
          workspaceId ? `team-invitations:${workspaceId}` : "team-invitations",
        ],
      });
      setRenewInvitation(null);
    },
    onError: (err) => notifyError(err),
  });
  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) =>
      workspaceId
        ? deleteTeamInvitation(String(workspaceId), invitationId)
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: [
          "dataTable",
          workspaceId ? `team-invitations:${workspaceId}` : "team-invitations",
        ],
      });
    },
    onError: (err) => notifyError(err),
  });
  const pendingExtraQuery = React.useMemo(() => ({ status: "pending" as const }), []);
  const acceptedExtraQuery = React.useMemo(() => ({ status: "accepted" as const }), []);
  const renderInvitationStatus = React.useCallback(
    (status: TeamInvitation["status"] | null | undefined): string => {
      if (status === "pending") return t("team:TEAM_INVITATION_STATUS_PENDING");
      if (status === "accepted") return t("team:TEAM_INVITATION_STATUS_ACCEPTED");
      if (status === "revoked") return t("team:TEAM_INVITATION_STATUS_REVOKED");
      if (status === "expired") return t("team:TEAM_INVITATION_STATUS_EXPIRED");
      return t("common:NA");
    },
    [t],
  );
  const invitationsColumns = React.useMemo<ColumnDef<TeamInvitation, unknown>[]>(() => {
    return [
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
        cell: ({ row }) => {
          const invitation = row.original;
          const roleName = invitation.roleCode ? roleNameByCode.get(invitation.roleCode) : null;
          const status = invitation.status;
          return (
            <InvitationUserLabel
              user={invitation.createdBy}
              roleLabel={roleName}
              status={status}
              statusLabel={renderInvitationStatus(status)}
              details={buildInvitationUserDetails({
                t,
                dateTime,
                inviteeEmail: invitation.email,
                createdAt: invitation.createdAt,
                expiresAt: invitation.expiresAt,
              })}
            />
          );
        },
      },

      {
        accessorKey: "status",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_STATUS"),
          sortKey: "status",
        },
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <InvitationStatusTag status={status} label={renderInvitationStatus(status)} />;
        },
      },
      {
        accessorKey: "createdAt",
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
        accessorKey: "expiresAt",
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
        enableSorting: false,
        size: 220,
        meta: buildDataTableActionsColumnMeta("right"),
        header: "",
        cell: ({ row }) => {
          const inv = row.original;
          const canRenew = inv.status === "pending";
          return (
            <DataTableActionsCell className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canRenew}
                onClick={() => {
                  setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                  setRenewInvitation(inv);
                }}
              >
                <RotateCcw className="size-4" />
                {t("team:TEAM_ACTION_RENEW")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteInvitation(inv);
                }}
              >
                <Link2Off className="size-4" />
                {t("team:TEAM_ACTION_DELETE")}
              </Button>
            </DataTableActionsCell>
          );
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateTime, deleteInvitationMutation, renderInvitationStatus, roleNameByCode, t]);
  const processedColumns = React.useMemo<ColumnDef<TeamInvitation, unknown>[]>(() => {
    return [
      {
        id: "email",
        meta: { title: t("team:TEAM_INVITATIONS_COL_EMAIL"), sortKey: "email" },
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => <span>{row.original.email || "-"}</span>,
      },
      {
        id: "role",
        meta: { title: t("team:TEAM_INVITATIONS_COL_ROLE"), sortKey: "role_code" },
        header: t("team:TEAM_INVITATIONS_COL_ROLE"),
        cell: ({ row }) => {
          const code = row.original.roleCode;
          return <span>{(code ? roleNameByCode.get(code) : null) || code || "-"}</span>;
        },
      },
      {
        id: "status",
        meta: {
          title: t("team:TEAM_INVITATIONS_COL_STATUS"),
          sortKey: "status",
        },
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => <span>{renderInvitationStatus(row.original.status)}</span>,
      },
      {
        id: "processedBy",
        meta: {
          title: t("common:ORG_MEMBERS_TABLE_MEMBER"),
          defaultHidden: true,
        },
        header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        cell: ({ row }) => {
          const invitation = row.original;
          const roleName = invitation.roleCode ? roleNameByCode.get(invitation.roleCode) : null;
          const status = invitation.status;
          return (
            <InvitationUserLabel
              user={invitation.acceptedBy}
              roleLabel={roleName}
              status={status}
              statusLabel={renderInvitationStatus(status)}
              details={buildInvitationUserDetails({
                t,
                dateTime,
                inviteeEmail: invitation.email,
                createdAt: invitation.createdAt,
                expiresAt: invitation.expiresAt,
                processedAt: invitation.acceptedAt || invitation.revokedAt,
                processedAtLabel: t("team:TEAM_INVITATIONS_COL_PROCESSED"),
              })}
            />
          );
        },
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
        meta: { title: t("team:TEAM_INVITATIONS_COL_CREATED"), sortKey: "created_at" },
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-label-secondary"}>{formatted || "-"}</span>
          );
        },
      },
    ];
  }, [dateTime, renderInvitationStatus, roleNameByCode, t]);
  const inviteLinksColumns = React.useMemo<ColumnDef<TeamInviteLink, unknown>[]>(() => {
    return [
      {
        id: "creator",
        size: 240,
        minSize: 220,
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
          defaultHidden: true,
        },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => {
          const link = row.original;
          const roleName = link.roleCode ? roleNameByCode.get(link.roleCode) : null;
          return (
            <InvitationUserLabel
              user={link.createdBy}
              roleLabel={roleName}
              usesCount={Number(link.usesCount || 0)}
              details={buildInvitationUserDetails({
                t,
                dateTime,
                createdAt: link.createdAt,
                expiresAt: link.expiresAt,
                lastUsedAt: link.lastUsedAt,
                lastUsedAtLabel: t("team:TEAM_INVITE_LINKS_COL_LAST_USED"),
              })}
            />
          );
        },
      },
      {
        accessorKey: "code",
        size: 180,
        minSize: 160,
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_CODE"),
          sortKey: "display_code",
        },
        header: t("team:TEAM_INVITE_LINKS_COL_CODE"),
        cell: ({ row }) => {
          const code = row.original.displayCode;
          const token = row.original.token;
          const inviteUrl =
            row.original.inviteUrl ??
            (typeof window !== "undefined"
              ? `${window.location.origin}/invitations?token=${encodeURIComponent(token)}`
              : null);
          return (
            <Button
              variant="link"
              size="sm"
              className="font-mono text-footnote"
              onClick={() => {
                const text = inviteUrl || code;
                void navigator.clipboard.writeText(text);
                notifySuccessText(t("team:TEAM_ACTION_COPIED"));
              }}
              aria-label={t("team:TEAM_INVITE_LINKS_ACTION_COPY_LINK")}
            >
              {code}
            </Button>
          );
        },
      },
      {
        id: "participant",
        size: 240,
        minSize: 220,
        meta: {
          title: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT"),
          sortKey: "uses_count",
        },
        header: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT"),
        cell: ({ row }) => {
          const uses = Number(row.original.usesCount || 0);
          const participants = row.original.recentParticipants ?? [];
          const lastUsedBy = row.original.lastUsedBy;
          const primaryUser = participants[0]?.user ?? lastUsedBy ?? null;
          return (
            <InviteLinkParticipantsPopover
              workspaceId={String(workspaceId || "")}
              linkId={row.original.id}
              usesCount={uses}
              primaryUser={primaryUser}
              lastUsedAt={row.original.lastUsedAt}
            />
          );
        },
      },
      {
        accessorKey: "createdAt",
        size: 190,
        minSize: 170,
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
        accessorKey: "expiresAt",
        size: 190,
        minSize: 170,
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
        enableSorting: false,
        size: 220,
        meta: buildDataTableActionsColumnMeta("right"),
        header: "",
        cell: ({ row }) => {
          const link = row.original;
          const disabled = Boolean(link.disabledAt);
          const canManage = !disabled;
          return (
            <DataTableActionsCell className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canManage}
                onClick={() => {
                  setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                  setRenewLink(link);
                }}
              >
                <RotateCcw className="size-4" />
                {t("team:TEAM_ACTION_RENEW")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!canManage}
                onClick={() => disableLinkMutation.mutate(link.id)}
              >
                <Link2Off className="size-4" />
                {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
              </Button>
            </DataTableActionsCell>
          );
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateTime, disableLinkMutation, renewLinkMutation, t, workspaceId]);
  const pendingTable = useDataTable<TeamInvitation, { status: "pending" | "accepted"; mine: true }>(
    {
      tableId: workspaceId ? `team-invitations:${workspaceId}` : "team-invitations",
      columns: invitationsColumns,
      extraQuery: { ...pendingExtraQuery, mine: true },
      initialState: { pageSize: 10 },
      fetcher: async (params) =>
        workspaceId
          ? listTeamInvitations(String(workspaceId), {
              page: params.page,
              size: params.size,
              q: params.q,
              ordering: params.ordering,
              status: (params.status ?? "pending") as "pending",
              mine: params.mine,
            })
          : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
      queryOptions: {
        enabled: Boolean(workspaceId) && tab === "pending",
        staleTime: 20 * 1000,
        retry: false,
        meta: { silent: true },
      },
    },
  );
  const acceptedTable = useDataTable<
    TeamInvitation,
    { status: "pending" | "accepted"; mine: true }
  >({
    tableId: workspaceId ? `team-invitations:${workspaceId}` : "team-invitations",
    columns: processedColumns,
    extraQuery: { ...acceptedExtraQuery, mine: true },
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      workspaceId
        ? listTeamInvitations(String(workspaceId), {
            page: params.page,
            size: params.size,
            q: params.q,
            ordering: params.ordering,
            status: (params.status ?? "accepted") as "accepted",
            mine: params.mine,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    queryOptions: {
      enabled: Boolean(workspaceId) && tab === "accepted",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });
  const renewOptions = React.useMemo<Array<{ label: string; value: RenewExpiresInSeconds }>>(
    () => [
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_1_DAY"), value: 1 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_7_DAYS"), value: 7 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_30_DAYS"), value: 30 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_NEVER"), value: null },
    ],
    [t],
  );
  const linksTable = useDataTable<TeamInviteLink, { mine: true }>({
    tableId: workspaceId ? `team-invite-links:${workspaceId}` : "team-invite-links",
    columns: inviteLinksColumns,
    extraQuery: { mine: true },
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      workspaceId
        ? listTeamInviteLinks(String(workspaceId), {
            page: params.page,
            size: params.size,
            q: params.q,
            ordering: params.ordering,
            mine: params.mine,
          }).then((data) => ({
            ...data,
            items: (data.items ?? []).filter((it) => !it.disabledAt),
          }))
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    queryOptions: {
      enabled: Boolean(workspaceId) && tab === "links",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });
  const inviteAction = (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => setInviteOpen(true)}>
        {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
      </Button>
      <Button onClick={() => setInviteEmailOpen(true)}>
        <Plus size={16} />
        {t("common:ORG_MEMBERS_INVITE")}
      </Button>
    </div>
  );
  const toolsLabels = buildDataTableToolsLabels(t);
  const invitationsTableId = workspaceId ? `team-invitations:${workspaceId}` : "team-invitations";
  const inviteLinksTableId = workspaceId ? `team-invite-links:${workspaceId}` : "team-invite-links";
  const [pendingRowHeight, setPendingRowHeight] = useDataTableRowHeightPreference({
    tableId: invitationsTableId,
  });
  const [pendingWrapHeaders, setPendingWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: invitationsTableId,
  });
  const [acceptedRowHeight, setAcceptedRowHeight] = useDataTableRowHeightPreference({
    tableId: invitationsTableId,
  });
  const [acceptedWrapHeaders, setAcceptedWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: invitationsTableId,
  });
  const [linksRowHeight, setLinksRowHeight] = useDataTableRowHeightPreference({
    tableId: inviteLinksTableId,
  });
  const [linksWrapHeaders, setLinksWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: inviteLinksTableId,
  });
  const activeTableConfig =
    tab === "pending"
      ? {
          tableHook: pendingTable,
          placeholder: t("team:TEAM_INVITATIONS_SEARCH_PENDING_PLACEHOLDER"),
          rowHeight: pendingRowHeight,
          setRowHeight: setPendingRowHeight,
          wrapHeaders: pendingWrapHeaders,
          setWrapHeaders: setPendingWrapHeaders,
        }
      : tab === "accepted"
        ? {
            tableHook: acceptedTable,
            placeholder: t("team:TEAM_INVITATIONS_SEARCH_ACCEPTED_PLACEHOLDER"),
            rowHeight: acceptedRowHeight,
            setRowHeight: setAcceptedRowHeight,
            wrapHeaders: acceptedWrapHeaders,
            setWrapHeaders: setAcceptedWrapHeaders,
          }
        : {
            tableHook: linksTable,
            placeholder: t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER"),
            rowHeight: linksRowHeight,
            setRowHeight: setLinksRowHeight,
            wrapHeaders: linksWrapHeaders,
            setWrapHeaders: setLinksWrapHeaders,
          };
  return (
    <ChromeTabs value={tab} onValueChange={(next) => setTab(next as TabKey)}>
      <DefaultPage
        title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
        description={t("team:TEAM_INVITATIONS_DESC")}
        className="h-full"
        contentClassName="min-h-0 flex flex-col"
        action={inviteAction}
        extra={
          <TeamInvitationsPageExtra
            tabs={[
              { value: "pending", label: t("team:TEAM_INVITATIONS_TAB_PENDING") },
              { value: "accepted", label: t("team:TEAM_INVITATIONS_TAB_ACCEPTED") },
              { value: "links", label: t("team:TEAM_INVITATIONS_TAB_LINKS") },
            ]}
            table={activeTableConfig.tableHook.table}
            searchInput={activeTableConfig.tableHook.searchInput}
            onSearchInputChange={activeTableConfig.tableHook.setSearchInput}
            searchPlaceholder={activeTableConfig.placeholder}
            clearLabel={t("common:CLEAR")}
            rowHeight={activeTableConfig.rowHeight}
            onRowHeightChange={activeTableConfig.setRowHeight}
            wrapHeaders={activeTableConfig.wrapHeaders}
            onWrapHeadersChange={activeTableConfig.setWrapHeaders}
            onRefresh={() => void activeTableConfig.tableHook.refetch()}
            refreshing={activeTableConfig.tableHook.isFetching}
            onResetColumnVisibility={activeTableConfig.tableHook.resetColumnVisibility}
            labels={toolsLabels}
          />
        }
      >
        <ChromeTabsContent value="pending" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={pendingTable}
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            t={t}
            rowHeight={pendingRowHeight}
            wrapHeaders={pendingWrapHeaders}
          />
        </ChromeTabsContent>
        <ChromeTabsContent value="accepted" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={acceptedTable}
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            t={t}
            rowHeight={acceptedRowHeight}
            wrapHeaders={acceptedWrapHeaders}
          />
        </ChromeTabsContent>
        <ChromeTabsContent value="links" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={linksTable}
            emptyTitle={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITE_LINKS_EMPTY_DESC")}
            t={t}
            rowHeight={linksRowHeight}
            wrapHeaders={linksWrapHeaders}
          />
        </ChromeTabsContent>
      </DefaultPage>
      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        mode="link"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => {
          // Inviting members may create:
          // - invitation deliveries (email-bound invitations)
          // - invite links (reusable join links)
          void queryClient.invalidateQueries({
            queryKey: [
              "dataTable",
              workspaceId ? `team-invitations:${workspaceId}` : "team-invitations",
            ],
          });
          void queryClient.invalidateQueries({
            queryKey: [
              "dataTable",
              workspaceId ? `team-invite-links:${workspaceId}` : "team-invite-links",
            ],
          });
        }}
      />
      <InviteMembersDialog
        open={inviteEmailOpen}
        onOpenChange={setInviteEmailOpen}
        mode="email"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => {
          void queryClient.invalidateQueries({
            queryKey: [
              "dataTable",
              workspaceId ? `team-invitations:${workspaceId}` : "team-invitations",
            ],
          });
        }}
      />
      <TeamInvitationsDialogs
        t={t}
        deleteInvitation={deleteInvitation}
        setDeleteInvitation={setDeleteInvitation}
        deleteInvitationPending={deleteInvitationMutation.isPending}
        onDeleteInvitation={(invitationId) => deleteInvitationMutation.mutateAsync(invitationId)}
        renewInvitation={renewInvitation}
        setRenewInvitation={setRenewInvitation}
        renewInvitationPending={renewInvitationMutation.isPending}
        onRenewInvitation={(payload) => renewInvitationMutation.mutateAsync(payload)}
        renewLink={renewLink}
        setRenewLink={setRenewLink}
        renewLinkPending={renewLinkMutation.isPending}
        onRenewLink={(payload) => renewLinkMutation.mutateAsync(payload)}
        renewExpiresInSeconds={renewExpiresInSeconds}
        setRenewExpiresInSeconds={setRenewExpiresInSeconds}
        renewOptions={renewOptions}
      />
    </ChromeTabs>
  );
}
