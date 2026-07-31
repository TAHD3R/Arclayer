"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { listWorkspaceRoles } from "@/api/rbac";
import {
  deleteTeamInvitation,
  disableTeamInviteLink,
  listTeamInviteLinks,
  listTeamInvitations,
  renewTeamInvitation,
  renewTeamInviteLink,
} from "@/api/team";
import { listMyWorkspaces } from "@/api/workspaces";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { FloatingBulkToolbar } from "@/components/common/floating-bulk-toolbar";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useWorkspaceRolesAccess } from "@/hooks/use-workspace-roles-access";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { TeamInvitationsDialogs } from "@/pages/workspaces/team/invitations/components/invitations-dialogs";
import { InviteMembersDialog } from "@/pages/workspaces/team/shared/components/invite-members-dialog";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { PageData, TeamInvitation, TeamInviteLink } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { useDataTable } from "@arclayer/ui/data-table";

import type {
  InvitationSort,
  InvitationTableFilters,
  RenewExpiresInSeconds,
  TabKey,
} from "../types";
import {
  createAcceptedInvitationColumns,
  createInviteLinkColumns,
  createPendingInvitationColumns,
} from "./invitation-table-columns";
import { InvitationTableControls } from "./invitation-table-controls";

const PENDING_TABLE_ID = "workspace-team-invitations-pending";
const ACCEPTED_TABLE_ID = "workspace-team-invitations-accepted";
const LINKS_TABLE_ID = "workspace-team-invitations-links";
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_ORDERING: InvitationSort = "-created_at";

function patchTableRows<T extends { id: string }>(
  queryClient: QueryClient,
  tableId: string,
  update: (rows: readonly T[]) => readonly T[],
) {
  queryClient.setQueriesData<PageData<T>>({ queryKey: ["dataTable", tableId] }, (current) => {
    if (!current) return current;
    const items = [...update(current.items)];
    return {
      ...current,
      items,
      total: Math.max(0, current.total - (current.items.length - items.length)),
    };
  });
}

function replaceTableRow<T extends { id: string }>(
  queryClient: QueryClient,
  tableId: string,
  replacement: T,
) {
  patchTableRows<T>(queryClient, tableId, (rows) =>
    rows.map((row) => (row.id === replacement.id ? replacement : row)),
  );
}

export function TeamInvitationsView(
  props: {
    workspaceIdOverride?: string | null;
    inviteLinkOpen?: boolean;
    onInviteLinkOpenChange?: (open: boolean) => void;
    inviteEmailOpen?: boolean;
    onInviteEmailOpenChange?: (open: boolean) => void;
    embedded?: boolean;
  } = {},
) {
  const { t } = useTranslation(["team", "nav", "common"]);
  const queryClient = useQueryClient();
  const settingsScreen = useSettingsScreen();
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const workspaceIdFromStore = useWorkspaceStore((state) => state.currentWorkspaceId);
  const workspaceId = props.workspaceIdOverride ?? workspaceIdFromStore;
  const rolesAccess = useWorkspaceRolesAccess(workspaceId ? String(workspaceId) : null);
  const roleManagementAvailable = rolesAccess.status === "available";
  const invitationAccessLabel =
    rolesAccess.status === "unavailable"
      ? t("team:TEAM_MEMBER_FIXED_ACCESS")
      : rolesAccess.status === "loading"
        ? t("team:TEAM_ACCESS_CHECKING")
        : rolesAccess.status === "error"
          ? t("team:TEAM_ACCESS_UNAVAILABLE")
          : "";
  const dateTime = useAdminDateTimeFormatter({ workspaceId });
  const [tab, setTab] = React.useState<TabKey>("pending");
  const [pendingFilters, setPendingFilters] = React.useState<InvitationTableFilters>({});
  const [acceptedFilters, setAcceptedFilters] = React.useState<InvitationTableFilters>({});
  const [linkFilters, setLinkFilters] = React.useState<InvitationTableFilters>({
    status: "active",
  });
  const [pendingOrdering, setPendingOrdering] = React.useState<InvitationSort>(DEFAULT_ORDERING);
  const [acceptedOrdering, setAcceptedOrdering] = React.useState<InvitationSort>(DEFAULT_ORDERING);
  const [linkOrdering, setLinkOrdering] = React.useState<InvitationSort>(DEFAULT_ORDERING);
  const [uncontrolledInviteLinkOpen, setUncontrolledInviteLinkOpen] = React.useState(false);
  const [uncontrolledInviteEmailOpen, setUncontrolledInviteEmailOpen] = React.useState(false);
  const inviteOpen = props.inviteLinkOpen ?? uncontrolledInviteLinkOpen;
  const setInviteOpen = props.onInviteLinkOpenChange ?? setUncontrolledInviteLinkOpen;
  const inviteEmailOpen = props.inviteEmailOpen ?? uncontrolledInviteEmailOpen;
  const setInviteEmailOpen = props.onInviteEmailOpenChange ?? setUncontrolledInviteEmailOpen;
  const [deleteInvitation, setDeleteInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewInvitation, setRenewInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewLink, setRenewLink] = React.useState<TeamInviteLink | null>(null);
  const [ephemeralInviteUrlByLinkId, setEphemeralInviteUrlByLinkId] = React.useState<
    Record<string, string>
  >({});
  const [renewExpiresInSeconds, setRenewExpiresInSeconds] = React.useState<RenewExpiresInSeconds>(
    7 * 24 * 60 * 60,
  );

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: listMyWorkspaces,
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const workspaceName = React.useMemo(() => {
    const workspace = (workspacesQuery.data?.items ?? []).find(
      (item) => String(item.workspaceId) === String(workspaceId),
    );
    return workspace?.name || t("team:TEAM_WORKSPACE_FALLBACK");
  }, [t, workspaceId, workspacesQuery.data?.items]);
  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles", "list", workspaceId],
    enabled: Boolean(workspaceId) && roleManagementAvailable,
    queryFn: () => listWorkspaceRoles(String(workspaceId), { size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const roleNameByCode = React.useMemo(
    () =>
      new Map((rolesQuery.data?.items ?? []).map((role) => [role.code, role.name || role.code])),
    [rolesQuery.data?.items],
  );

  const invalidateInvitationTables = React.useCallback(
    async (tableIds: readonly string[]) => {
      await Promise.all(
        tableIds.map((tableId) =>
          queryClient.invalidateQueries({ queryKey: ["dataTable", tableId], exact: false }),
        ),
      );
    },
    [queryClient],
  );
  const revokeMutation = useMutation({
    mutationFn: async (ids: readonly string[]) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await Promise.all(ids.map((id) => deleteTeamInvitation(String(workspaceId), id)));
      return ids;
    },
    onSuccess: (ids) => {
      const revokedIds = new Set(ids);
      patchTableRows<TeamInvitation>(queryClient, PENDING_TABLE_ID, (rows) =>
        rows.filter((row) => !revokedIds.has(row.id)),
      );
      notifySuccessText(t("team:TEAM_INVITATIONS_REVOKE_SUCCESS", { count: ids.length }));
      setDeleteInvitation(null);
    },
    onError: notifyError,
  });
  const renewInvitationMutation = useMutation({
    mutationFn: async (payload: { invitationId: string; expiresInSeconds: number | null }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return renewTeamInvitation(String(workspaceId), payload.invitationId, {
        expiresInSeconds: payload.expiresInSeconds,
      });
    },
    onSuccess: (result) => {
      replaceTableRow(queryClient, PENDING_TABLE_ID, result.invitation);
      setRenewInvitation(null);
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
    },
    onError: notifyError,
  });
  const renewLinkMutation = useMutation({
    mutationFn: async (payload: { linkId: string; expiresInSeconds: number | null }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return renewTeamInviteLink(String(workspaceId), payload.linkId, {
        expiresInSeconds: payload.expiresInSeconds,
      });
    },
    onSuccess: (result) => {
      const inviteUrl =
        result.inviteUrl ??
        `${window.location.origin}/invitations?token=${encodeURIComponent(result.token)}`;
      setEphemeralInviteUrlByLinkId((current) => ({
        ...current,
        [result.link.id]: inviteUrl,
      }));
      replaceTableRow(queryClient, LINKS_TABLE_ID, result.link);
      setRenewLink(null);
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
    },
    onError: notifyError,
  });
  const disableLinkMutation = useMutation({
    mutationFn: async (link: TeamInviteLink) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await disableTeamInviteLink(String(workspaceId), link.id);
      return link;
    },
    onSuccess: (link) => {
      patchTableRows<TeamInviteLink>(queryClient, LINKS_TABLE_ID, (rows) =>
        rows.filter((row) => row.id !== link.id),
      );
      setEphemeralInviteUrlByLinkId((current) => {
        const { [link.id]: _removed, ...rest } = current;
        return rest;
      });
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
    },
    onError: notifyError,
  });

  const pendingColumns = React.useMemo(
    () =>
      createPendingInvitationColumns({
        t,
        dateTime,
        roleNameByCode,
        roleManagementAvailable,
        unavailableAccessLabel: invitationAccessLabel,
        mutating: revokeMutation.isPending || renewInvitationMutation.isPending,
        onRenew: (invitation) => {
          setRenewExpiresInSeconds(7 * 24 * 60 * 60);
          setRenewInvitation(invitation);
        },
        onRevoke: setDeleteInvitation,
      }),
    [
      dateTime,
      invitationAccessLabel,
      renewInvitationMutation.isPending,
      revokeMutation.isPending,
      roleManagementAvailable,
      roleNameByCode,
      t,
    ],
  );
  const acceptedColumns = React.useMemo(
    () =>
      createAcceptedInvitationColumns({
        t,
        dateTime,
        roleNameByCode,
        roleManagementAvailable,
        unavailableAccessLabel: invitationAccessLabel,
        onOpenMembers: () => settingsScreen.openSettings({ screen: "workspace.members" }),
      }),
    [dateTime, invitationAccessLabel, roleManagementAvailable, roleNameByCode, settingsScreen, t],
  );
  const linkColumns = React.useMemo(
    () =>
      createInviteLinkColumns({
        t,
        dateTime,
        roleNameByCode,
        roleManagementAvailable,
        unavailableAccessLabel: invitationAccessLabel,
        workspaceId: String(workspaceId || ""),
        ephemeralInviteUrlByLinkId,
        mutating: renewLinkMutation.isPending || disableLinkMutation.isPending,
        onRenew: (link) => {
          setRenewExpiresInSeconds(7 * 24 * 60 * 60);
          setRenewLink(link);
        },
        onDisable: (link) => disableLinkMutation.mutate(link),
        onCopy: (url) => {
          void navigator.clipboard.writeText(url);
          notifySuccessText(t("team:TEAM_ACTION_COPIED"));
        },
      }),
    [
      dateTime,
      disableLinkMutation.isPending,
      ephemeralInviteUrlByLinkId,
      invitationAccessLabel,
      renewLinkMutation.isPending,
      roleManagementAvailable,
      roleNameByCode,
      t,
      workspaceId,
    ],
  );

  const pendingTable = useDataTable<TeamInvitation, InvitationTableFilters>({
    tableId: PENDING_TABLE_ID,
    columns: pendingColumns,
    initialState: { pageSize: DEFAULT_PAGE_SIZE },
    extraQuery: pendingFilters,
    orderingOverride: pendingOrdering,
    features: { sorting: { enabled: false } },
    rowSelection: { enabled: true, getRowId: (row) => row.id },
    fetcher: (params) =>
      listTeamInvitations(String(workspaceId), {
        page: params.page,
        size: params.size,
        q: params.q,
        ordering: pendingOrdering,
        status: "pending",
        role_code: roleManagementAvailable ? params.roleCode : undefined,
      }),
    queryOptions: { enabled: Boolean(workspaceId) && tab === "pending", retry: false },
  });
  const acceptedTable = useDataTable<TeamInvitation, InvitationTableFilters>({
    tableId: ACCEPTED_TABLE_ID,
    columns: acceptedColumns,
    initialState: { pageSize: DEFAULT_PAGE_SIZE },
    extraQuery: acceptedFilters,
    orderingOverride: acceptedOrdering,
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listTeamInvitations(String(workspaceId), {
        page: params.page,
        size: params.size,
        q: params.q,
        ordering: acceptedOrdering,
        status: "accepted",
        role_code: roleManagementAvailable ? params.roleCode : undefined,
      }),
    queryOptions: { enabled: Boolean(workspaceId) && tab === "accepted", retry: false },
  });
  const linksTable = useDataTable<TeamInviteLink, InvitationTableFilters>({
    tableId: LINKS_TABLE_ID,
    columns: linkColumns,
    initialState: { pageSize: DEFAULT_PAGE_SIZE },
    extraQuery: linkFilters,
    orderingOverride: linkOrdering,
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listTeamInviteLinks(String(workspaceId), {
        page: params.page,
        size: params.size,
        q: params.q,
        ordering: linkOrdering,
        role_code: roleManagementAvailable ? params.roleCode : undefined,
        status: params.status,
      }),
    queryOptions: { enabled: Boolean(workspaceId) && tab === "links", retry: false },
  });

  const tabs = [
    { value: "pending" as const, label: t("team:TEAM_INVITATIONS_TAB_PENDING") },
    { value: "accepted" as const, label: t("team:TEAM_INVITATIONS_TAB_ACCEPTED") },
    { value: "links" as const, label: t("team:TEAM_INVITATIONS_TAB_LINKS") },
  ];
  const currentTable =
    tab === "pending" ? pendingTable : tab === "accepted" ? acceptedTable : linksTable;
  const currentFilters =
    tab === "pending" ? pendingFilters : tab === "accepted" ? acceptedFilters : linkFilters;
  const currentOrdering =
    tab === "pending" ? pendingOrdering : tab === "accepted" ? acceptedOrdering : linkOrdering;
  const setCurrentFilters =
    tab === "pending"
      ? setPendingFilters
      : tab === "accepted"
        ? setAcceptedFilters
        : setLinkFilters;
  const setCurrentOrdering =
    tab === "pending"
      ? setPendingOrdering
      : tab === "accepted"
        ? setAcceptedOrdering
        : setLinkOrdering;
  const toolbar = (
    <PageExtraToolbar
      leading={
        <>
          <ChromeTabsList className="w-auto">
            {tabs.map((item) => (
              <ChromeTabsTrigger key={item.value} value={item.value}>
                {item.label}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>
          <DataTableSearchInput
            value={currentTable.searchInput}
            onChange={currentTable.setSearchInput}
            placeholder={
              tab === "pending"
                ? t("team:TEAM_INVITATIONS_SEARCH_PENDING_PLACEHOLDER")
                : tab === "accepted"
                  ? t("team:TEAM_INVITATIONS_SEARCH_ACCEPTED_PLACEHOLDER")
                  : t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER")
            }
            clearLabel={t("common:CLEAR")}
          />
          <InvitationTableControls
            mode={tab}
            value={currentFilters}
            onChange={setCurrentFilters}
            ordering={currentOrdering}
            onOrderingChange={setCurrentOrdering}
            roleManagementAvailable={roleManagementAvailable}
            roles={rolesQuery.data?.items ?? []}
          />
        </>
      }
      trailing={
        <Button
          variant="outline"
          size="icon"
          loading={currentTable.isFetching}
          aria-label={t("common:REFRESH")}
          onClick={() => void currentTable.refetch()}
        >
          <RefreshCw />
        </Button>
      }
    />
  );
  const inviteAction = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={rolesAccess.status === "loading" || rolesAccess.status === "error"}
        onClick={() => setInviteOpen(true)}
      >
        {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
      </Button>
      <Button
        disabled={rolesAccess.status === "loading" || rolesAccess.status === "error"}
        onClick={() => setInviteEmailOpen(true)}
      >
        <Plus size={16} />
        {t("common:ORG_MEMBERS_INVITE")}
      </Button>
    </div>
  );
  const selectedPendingIds = pendingTable.table
    .getSelectedRowModel()
    .rows.map((row) => row.original.id);
  const renewOptions = [
    { label: t("team:TEAM_INVITE_LINK_EXPIRES_1_DAY"), value: 24 * 60 * 60 },
    { label: t("team:TEAM_INVITE_LINK_EXPIRES_7_DAYS"), value: 7 * 24 * 60 * 60 },
    { label: t("team:TEAM_INVITE_LINK_EXPIRES_30_DAYS"), value: 30 * 24 * 60 * 60 },
    { label: t("team:TEAM_INVITE_LINK_EXPIRES_NEVER"), value: null },
  ] satisfies Array<{ label: string; value: RenewExpiresInSeconds }>;

  const tableContent = (
    <ChromeTabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChromeTabsContent value="pending" className="min-h-0 flex-1">
          <AdminDataTableSection
            table={pendingTable.table}
            emptyText={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            loading={pendingTable.isLoading}
            error={pendingTable.error}
            onRetry={() => void pendingTable.refetch()}
            t={t}
            rowHeight="short"
            wrapHeaders
            refreshing={pendingTable.isFetching && !pendingTable.isLoading}
            infiniteScroll={pendingTable.infiniteScroll}
            toolbar={toolbar}
          />
        </ChromeTabsContent>
        <ChromeTabsContent value="accepted" className="min-h-0 flex-1">
          <AdminDataTableSection
            table={acceptedTable.table}
            emptyText={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            loading={acceptedTable.isLoading}
            error={acceptedTable.error}
            onRetry={() => void acceptedTable.refetch()}
            t={t}
            rowHeight="short"
            wrapHeaders
            refreshing={acceptedTable.isFetching && !acceptedTable.isLoading}
            infiniteScroll={acceptedTable.infiniteScroll}
            toolbar={toolbar}
          />
        </ChromeTabsContent>
        <ChromeTabsContent value="links" className="min-h-0 flex-1">
          <AdminDataTableSection
            table={linksTable.table}
            emptyText={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}
            emptyTitle={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITE_LINKS_EMPTY_DESC")}
            loading={linksTable.isLoading}
            error={linksTable.error}
            onRetry={() => void linksTable.refetch()}
            t={t}
            rowHeight="short"
            wrapHeaders
            refreshing={linksTable.isFetching && !linksTable.isLoading}
            infiniteScroll={linksTable.infiniteScroll}
            toolbar={toolbar}
          />
        </ChromeTabsContent>
      </div>

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        mode="link"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roleManagementAvailable={roleManagementAvailable}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => void invalidateInvitationTables([LINKS_TABLE_ID])}
      />
      <InviteMembersDialog
        open={inviteEmailOpen}
        onOpenChange={setInviteEmailOpen}
        mode="email"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roleManagementAvailable={roleManagementAvailable}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => void invalidateInvitationTables([PENDING_TABLE_ID])}
      />
      <TeamInvitationsDialogs
        t={t}
        deleteInvitation={deleteInvitation}
        setDeleteInvitation={setDeleteInvitation}
        deleteInvitationPending={revokeMutation.isPending}
        onDeleteInvitation={(invitationId) => revokeMutation.mutateAsync([invitationId])}
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
      <FloatingBulkToolbar
        visible={selectedPendingIds.length > 0}
        selectedLabel={t("team:TEAM_INVITATIONS_SELECTED_COUNT", {
          count: selectedPendingIds.length,
        })}
        clearLabel={t("common:DATA_TABLE_CLEAR_SELECTION")}
        onClear={() => pendingTable.table.resetRowSelection()}
        actions={[
          {
            key: "revoke",
            label: t("team:TEAM_INVITATIONS_ACTION_REVOKE"),
            icon: <Trash2 className="size-4" />,
            variant: "destructive",
            disabled: revokeMutation.isPending,
            onClick: () => revokeMutation.mutate(selectedPendingIds),
          },
        ]}
      />
    </ChromeTabs>
  );

  if (props.embedded) return tableContent;

  return (
    <DefaultPage
      title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
      description={t("team:TEAM_INVITATIONS_DESC")}
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      action={inviteAction}
    >
      {tableContent}
    </DefaultPage>
  );
}
