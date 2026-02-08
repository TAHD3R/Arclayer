"use client";
import { Button as AntButton, Tag } from "antd";
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
  type TeamInvitation,
  type TeamInviteLink,
} from "@/api/team";
import { DefaultPage } from "@/components/common/default-page";
import { useDataTable } from "@/components/data-table";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { InviteMembersDialog } from "@/components/common/team/invite-members-dialog";
import { InviteLinkParticipantsPopover } from "@/components/common/team/invite-link-participants-popover";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { renderUserLabel } from "./invitations-helpers";
import type { RenewExpiresInSeconds, TabKey } from "./invitations-helpers";
import { TeamInvitationsTableSection } from "./invitations-table-section";
import { TeamInvitationsDialogs } from "./invitations-dialogs";
export function TeamInvitationsView() {
  const { t } = useTranslation(["team", "nav", "common"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const dateTime = useWorkspaceDateTimeFormatter();
  const [tab, setTab] = React.useState<TabKey>("pending");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [deleteInvitation, setDeleteInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewInvitation, setRenewInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewLink, setRenewLink] = React.useState<TeamInviteLink | null>(null);
  const [renewExpiresInSeconds, setRenewExpiresInSeconds] = React.useState<RenewExpiresInSeconds>(
    7 * 24 * 60 * 60,
  );
  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces"],
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
        meta: { title: t("team:TEAM_INVITATIONS_COL_EMAIL") },
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => {
          const inv = row.original;
          const inviter = inv.createdBy;
          const inviterLabel =
            (inviter?.displayName || inviter?.username || inviter?.email || "").trim() || "-";
          const roleCode = inv.roleCode || null;
          const roleName = roleCode ? (roleNameByCode.get(roleCode) ?? roleCode) : null;
          return (
            <div className="min-w-0">
              <div className="font-medium truncate">{inv.email || "-"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {t("team:TEAM_INVITATIONS_SENT_BY", { inviter: inviterLabel })}
              </div>
              <div className="mt-1">
                <Tag style={{ marginInlineEnd: 0 }}>{roleName || t("common:NA")}</Tag>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        meta: { title: t("team:TEAM_INVITATIONS_COL_CREATED") },
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          const datetime = formatted || "-";
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {t("team:TEAM_INVITATIONS_SENT_AT", { datetime })}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        meta: { title: t("team:TEAM_INVITATIONS_COL_STATUS") },
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const inv = row.original;
          return <span>{renderInvitationStatus(inv.status)}</span>;
        },
      },
      {
        accessorKey: "expiresAt",
        meta: { title: t("team:TEAM_INVITATIONS_COL_EXPIRES") },
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
        enableHiding: false,
        meta: { title: t("team:TEAM_TABLE_COL_ACTIONS") },
        header: "",
        cell: ({ row }) => {
          const inv = row.original;
          const canRenew = inv.status === "pending";
          return (
            <div className="flex items-center justify-end gap-2">
              <AntButton
                type="text"
                icon={<RotateCcw className="size-4" />}
                disabled={!canRenew}
                onClick={() => {
                  setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                  setRenewInvitation(inv);
                }}
              >
                {t("team:TEAM_ACTION_RENEW")}
              </AntButton>
              <AntButton
                type="text"
                danger
                onClick={() => {
                  setDeleteInvitation(inv);
                }}
              >
                {t("team:TEAM_ACTION_DELETE")}
              </AntButton>
            </div>
          );
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateTime, deleteInvitationMutation, renderInvitationStatus, roleNameByCode, t]);
  const inviteLinksColumns = React.useMemo<ColumnDef<TeamInviteLink, unknown>[]>(() => {
    return [
      {
        id: "creator",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_CREATOR") },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        accessorKey: "code",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_CODE") },
        header: t("team:TEAM_INVITE_LINKS_COL_CODE"),
        cell: ({ row }) => {
          const code = row.original.displayCode;
          const token = row.original.token;
          const inviteUrl =
            row.original.inviteUrl ??
            (typeof window !== "undefined"
              ? `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`
              : null);
          return (
            <AntButton
              type="link"
              size="small"
              className="font-mono text-sm"
              onClick={() => {
                const text = inviteUrl || code;
                void navigator.clipboard.writeText(text);
                notifySuccessText(t("team:TEAM_ACTION_COPIED"));
              }}
              aria-label={t("team:TEAM_INVITE_LINKS_ACTION_COPY_LINK")}
            >
              {code}
            </AntButton>
          );
        },
      },
      {
        id: "participant",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT") },
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
            />
          );
        },
      },
      {
        accessorKey: "createdAt",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_CREATED") },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>
          );
        },
      },
      {
        accessorKey: "expiresAt",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_EXPIRES") },
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
        enableHiding: false,
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_ACTIONS") },
        header: "",
        cell: ({ row }) => {
          const link = row.original;
          const disabled = Boolean(link.disabledAt);
          const canManage = !disabled;
          return (
            <div className="flex items-center justify-end gap-2">
              <AntButton
                type="text"
                icon={<RotateCcw className="size-4" />}
                disabled={!canManage}
                onClick={() => {
                  setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                  setRenewLink(link);
                }}
              >
                {t("team:TEAM_ACTION_RENEW")}
              </AntButton>
              <AntButton
                type="text"
                danger
                icon={<Link2Off className="size-4" />}
                disabled={!canManage}
                onClick={() => disableLinkMutation.mutate(link.id)}
              >
                {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
              </AntButton>
            </div>
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
    columns: invitationsColumns,
    extraQuery: { ...acceptedExtraQuery, mine: true },
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      workspaceId
        ? listTeamInvitations(String(workspaceId), {
            page: params.page,
            size: params.size,
            q: params.q,
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
    <AntButton type="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
      {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
    </AntButton>
  );
  return (
    <DefaultPage
      title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
      description={t("team:TEAM_INVITATIONS_DESC")}
      width="full"
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      action={inviteAction}
    >
      <ChromeTabs value={tab} onValueChange={(next) => setTab(next as TabKey)}>
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="pending">
            {t("team:TEAM_INVITATIONS_TAB_PENDING")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="accepted">
            {t("team:TEAM_INVITATIONS_TAB_ACCEPTED")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="links">
            {t("team:TEAM_INVITATIONS_TAB_LINKS")}
          </ChromeTabsTrigger>
        </ChromeTabsList>
        <ChromeTabsContent value="pending" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={pendingTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_PENDING_PLACEHOLDER")}
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>
        <ChromeTabsContent value="accepted" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={acceptedTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_ACCEPTED_PLACEHOLDER")}
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>
        <ChromeTabsContent value="links" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={linksTable}
            placeholder={t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER")}
            emptyTitle={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITE_LINKS_EMPTY_DESC")}
            showSearch={false}
            t={t}
          />
        </ChromeTabsContent>
      </ChromeTabs>
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
    </DefaultPage>
  );
}
