import { Eye, MoreVertical, Plus, UserCheck, UserCog, UserX } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TeamMembershipStatusTag, TeamRoleTag, TeamUserStatusTag } from "@/components/ui/tags";

import * as authApi from "@/api/auth";
import { listMyWorkspaces } from "@/api/workspaces";
import { listWorkspaceRoles } from "@/api/rbac";
import {
  disableTeamMember,
  enableTeamMember,
  listTeamMembers,
  setTeamMemberRoles,
} from "@/api/team";
import { MemberIdentityCell } from "@/pages/workspaces/team/shared/components/member-identity-cell";
import type { TeamMember, UserStatus } from "@/types/api";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import {
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
  useDataTable,
} from "@arclayer/ui/data-table";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
} from "@arclayer/ui/dropdown-menu";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  DEFAULT_TEAM_MEMBER_PAGE_SIZE,
  DEFAULT_TEAM_MEMBER_SORT,
} from "@/pages/workspaces/team/shared/constants";
import type { TeamMemberSort, TeamMembersFilters } from "@/pages/workspaces/team/shared/types";
import { useAuthStore } from "@/stores/use-auth-store";
import { InviteMembersDialog } from "@/pages/workspaces/team/shared/components/invite-members-dialog";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { EditMemberRolesDialog } from "@/pages/workspaces/team/shared/components/edit-member-roles-dialog";
import { WorkspaceMemberContextDialog } from "@/pages/workspaces/team/shared/components/workspace-member-context-dialog";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import type { TeamMemberExtraQuery } from "../types";
import {
  buildTeamMemberExtraQuery,
  resolveWorkspaceName,
  sortValueToTableSorting,
  tableSortingToSortValue,
  teamMembersQueryKey,
  teamMembersTableId,
} from "../utils";
import { TeamMembersPageToolbar } from "@/pages/workspaces/team/shared/components/team-members-page-toolbar";

export function TeamMembersView(props: {
  initialSearchQuery?: string;
  initialInspectMemberId?: string;
}) {
  const { t } = useTranslation(["team", "common"]);

  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [filters, setFilters] = React.useState<TeamMembersFilters>({});

  const [sort, setSort] = React.useState<TeamMemberSort>(DEFAULT_TEAM_MEMBER_SORT);

  const dataTableId = React.useMemo(
    () => teamMembersTableId(workspaceId ? String(workspaceId) : null),
    [workspaceId],
  );
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId: dataTableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId: dataTableId });

  const [inviteOpen, setInviteOpen] = React.useState(false);

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const currentUserId = meQuery.data?.id ?? null;

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceName = React.useMemo(
    () =>
      resolveWorkspaceName(
        workspacesQuery.data?.items,
        workspaceId ? String(workspaceId) : null,
        t("team:TEAM_WORKSPACE_FALLBACK"),
      ),
    [t, workspaceId, workspacesQuery.data?.items],
  );

  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles", "list", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceRoles(String(workspaceId), { size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const rolesQueryFailed = rolesQuery.isError;

  const roleNameByCode = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rolesQuery.data?.items ?? []) {
      map.set(r.code, r.name || r.code);
    }
    return map;
  }, [rolesQuery.data?.items]);

  const [editingMember, setEditingMember] = React.useState<TeamMember | null>(null);
  const [editingRoleCode, setEditingRoleCode] = React.useState<string | null>(null);
  const [inspectingMember, setInspectingMember] = React.useState<TeamMember | null>(null);
  const hydratedSearchRef = React.useRef<string | null>(null);
  const hydratedInspectRef = React.useRef<string | null>(null);
  const canEditRoles = Boolean(editingMember) && editingMember?.membershipStatus === "active";

  const extraQuery = React.useMemo<TeamMemberExtraQuery>(
    () => buildTeamMemberExtraQuery(filters),
    [filters.membershipStatus, filters.roleCode, filters.userStatus],
  );

  const enableMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return enableTeamMember(String(workspaceId), membershipId);
    },
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: teamMembersQueryKey(workspaceId ? String(workspaceId) : null),
      });
    },
    onError: (err) => notifyError(err),
  });

  const disableMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return disableTeamMember(String(workspaceId), membershipId);
    },
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: teamMembersQueryKey(workspaceId ? String(workspaceId) : null),
      });
    },
    onError: (err) => notifyError(err),
  });

  const updateRolesMutation = useMutation({
    mutationFn: async (payload: { membershipId: string; roleCodes: string[] }) =>
      workspaceId
        ? setTeamMemberRoles(String(workspaceId), payload.membershipId, {
            roleCodes: payload.roleCodes,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({
        queryKey: teamMembersQueryKey(workspaceId ? String(workspaceId) : null),
      });
      setEditingMember(null);
      setEditingRoleCode(null);
    },
    onError: (err) => notifyError(err),
  });

  const dateTime = useWorkspaceDateTimeFormatter();

  const columns = React.useMemo<ColumnDef<TeamMember, unknown>[]>(() => {
    const cols: ColumnDef<TeamMember, unknown>[] = [
      {
        id: "user",
        meta: {
          title: t("team:TEAM_TABLE_COL_USER"),
          sortKey: "user__username",
          kind: "primary",
        },
        header: t("team:TEAM_TABLE_COL_USER"),
        cell: ({ row }) => {
          const m = row.original;
          const canEnable = m.membershipStatus === "disabled";
          const canDisable = m.membershipStatus === "active";
          const isSelf = currentUserId ? String(currentUserId) === String(m.userId) : false;
          const canEditMemberRoles = m.membershipStatus === "active";
          const roleSummary =
            m.roleCodes.length <= 1
              ? (roleNameByCode.get(m.roleCodes[0] ?? "") ?? m.roleCodes[0] ?? "-")
              : t("team:TEAM_MEMBER_CONTEXT_MULTIPLE_ROLES", { count: m.roleCodes.length });
          const hoverStatusLabel =
            m.userStatus === "active"
              ? t("team:TEAM_USER_STATUS_ACTIVE")
              : m.userStatus === "disabled"
                ? t("team:TEAM_USER_STATUS_DISABLED")
                : t("team:TEAM_USER_STATUS_LOCKED");

          return (
            <div className="flex items-center gap-3">
              <MemberIdentityCell
                member={m}
                scopeLabel={t("team:TEAM_MEMBER_CONTEXT_SCOPE")}
                scopeVariant="workspace"
                badges={
                  <>
                    <TeamRoleTag
                      className="!mr-0 max-w-full overflow-hidden"
                      label={<span className="truncate">{roleSummary}</span>}
                    />
                    <TeamUserStatusTag
                      status={m.userStatus}
                      className="!mr-0 max-w-full overflow-hidden"
                      label={<span className="truncate">{hoverStatusLabel}</span>}
                    />
                  </>
                }
                description={t("team:TEAM_MEMBER_CONTEXT_HOVER_SUMMARY", {
                  roleCount: m.roleCodes.length,
                })}
                onOpenDetails={() => setInspectingMember(m)}
                className="min-w-0 flex-1"
              />

              <div className="ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t("team:TEAM_USER_ACTIONS")}>
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuIconItem
                      icon={<Eye className="size-4" />}
                      onSelect={() => setInspectingMember(m)}
                    >
                      {t("team:TEAM_MEMBER_CONTEXT_TITLE")}
                    </DropdownMenuIconItem>
                    <DropdownMenuIconItem
                      icon={<UserCog className="size-4" />}
                      disabled={!canEditMemberRoles || rolesQueryFailed}
                      onSelect={() => {
                        setEditingMember(m);
                        setEditingRoleCode(m.roleCodes?.[0] ?? null);
                      }}
                    >
                      {t("team:TEAM_ACTION_EDIT_ROLES")}
                    </DropdownMenuIconItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuIconItem
                      icon={<UserCheck className="size-4" />}
                      disabled={!canEnable}
                      onSelect={() => enableMutation.mutate(m.membershipId)}
                    >
                      {t("team:TEAM_ACTION_ENABLE")}
                    </DropdownMenuIconItem>
                    <DropdownMenuIconItem
                      icon={<UserX className="size-4" />}
                      disabled={!canDisable || isSelf}
                      onSelect={() => {
                        if (isSelf) return;
                        disableMutation.mutate(m.membershipId);
                      }}
                    >
                      {isSelf
                        ? t("team:TEAM_ACTION_DISABLE_SELF_DISABLED")
                        : t("team:TEAM_ACTION_DISABLE")}
                    </DropdownMenuIconItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        },
        size: 360,
        minSize: 300,
      },
      {
        id: "roles",
        meta: {
          title: t("team:TEAM_TABLE_COL_ROLES"),
          kind: "meta",
        },
        header: () => <span>{t("team:TEAM_TABLE_COL_ROLES")}</span>,
        cell: ({ row }) => {
          const codes = row.original.roleCodes ?? [];
          if (!codes.length) return <span className="text-label-secondary">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {codes.slice(0, 3).map((code) => (
                <TeamRoleTag
                  key={code}
                  className="mr-0!"
                  label={roleNameByCode.get(code) ?? code}
                />
              ))}
              {codes.length > 3 ? (
                <span className="text-label-secondary text-caption">
                  {t("team:TEAM_MORE_ROLES", { count: codes.length - 3 })}
                </span>
              ) : null}
            </div>
          );
        },
        size: 220,
        minSize: 180,
      },
      {
        accessorKey: "userStatus",
        meta: {
          title: t("team:TEAM_TABLE_COL_STATUS"),
          sortKey: "status",
          kind: "status",
        },
        header: t("team:TEAM_TABLE_COL_STATUS"),
        cell: ({ row }) => {
          const membership = row.original.membershipStatus;
          const user = row.original.userStatus;
          const isNormal = membership === "active" && user === "active";
          return (
            <div className="flex flex-wrap items-center gap-1">
              <TeamMembershipStatusTag
                status={membership}
                className="mr-0!"
                label={
                  membership === "active"
                    ? t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE")
                    : membership === "invited"
                      ? t("team:TEAM_MEMBERSHIP_STATUS_INVITED")
                      : t("team:TEAM_MEMBERSHIP_STATUS_DISABLED")
                }
              />
              {!isNormal && (
                <TeamUserStatusTag
                  status={user}
                  className="mr-0!"
                  label={
                    user === "active"
                      ? t("team:TEAM_USER_STATUS_ACTIVE")
                      : user === "disabled"
                        ? t("team:TEAM_USER_STATUS_DISABLED")
                        : t("team:TEAM_USER_STATUS_LOCKED")
                  }
                />
              )}
            </div>
          );
        },
        size: 190,
        minSize: 168,
      },
      {
        accessorKey: "lastLoginAt",
        meta: {
          title: t("team:TEAM_TABLE_COL_LAST_LOGIN"),
          sortKey: "user__last_login_at",
          kind: "time",
        },
        header: t("team:TEAM_TABLE_COL_LAST_LOGIN"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDateTimeOrNull(row.original.lastLoginAt);
          return (
            <span className={formatted ? "" : "text-label-secondary"}>
              {formatted || t("team:TEAM_LAST_LOGIN_NEVER")}
            </span>
          );
        },
        size: 210,
        minSize: 190,
      },
    ];
    return cols;
  }, [currentUserId, dateTime, roleNameByCode, rolesQueryFailed, t]);

  const tableHook = useDataTable<
    TeamMember,
    { status?: TeamMember["membershipStatus"]; userStatus?: UserStatus; roleCode?: string }
  >({
    tableId: dataTableId,
    columns,
    extraQuery,
    orderingOverride: sort,
    initialState: { pageSize: DEFAULT_TEAM_MEMBER_PAGE_SIZE },
    onSortingChange: (nextSorting) => {
      const mapped = tableSortingToSortValue(nextSorting);
      setSort(mapped ?? DEFAULT_TEAM_MEMBER_SORT);
    },
    fetcher: async (params) =>
      workspaceId
        ? listTeamMembers(String(workspaceId), {
            page: params.page,
            size: params.size,
            q: params.q,
            ordering: params.ordering,
            status: params.status,
            userStatus: params.userStatus,
            roleCode: params.roleCode,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const table = tableHook.table;
  const pageData = tableHook.pageData;
  const toolsLabels = React.useMemo(() => buildDataTableToolsLabels(t), [t]);

  React.useEffect(() => {
    const nextQuery = String(props.initialSearchQuery || "").trim();
    if (!nextQuery || hydratedSearchRef.current === nextQuery) return;
    hydratedSearchRef.current = nextQuery;
    tableHook.setSearchInput(nextQuery);
  }, [props.initialSearchQuery, tableHook]);

  React.useEffect(() => {
    const nextMemberId = String(props.initialInspectMemberId || "").trim();
    if (!nextMemberId || hydratedInspectRef.current === nextMemberId) return;
    const matched =
      tableHook.items.find((member) => String(member.userId) === nextMemberId) ?? null;
    if (!matched) return;
    hydratedInspectRef.current = nextMemberId;
    setInspectingMember(matched);
  }, [props.initialInspectMemberId, tableHook.items]);

  const pageToolbar = (
    <TeamMembersPageToolbar
      table={table}
      searchInput={tableHook.searchInput}
      onSearchInputChange={tableHook.setSearchInput}
      filters={filters}
      onFiltersChange={setFilters}
      sort={sort}
      onSortChange={(next) => {
        setSort(next);
        tableHook.setSorting(sortValueToTableSorting(next));
      }}
      roles={rolesQuery.data?.items ?? []}
      rolesLoading={rolesQuery.isLoading}
      rowHeight={rowHeight}
      onRowHeightChange={setRowHeight}
      wrapHeaders={wrapHeaders}
      onWrapHeadersChange={setWrapHeaders}
      refreshing={tableHook.isFetching}
      onRefresh={() => void tableHook.refetch()}
      onResetColumnVisibility={tableHook.resetColumnVisibility}
      toolsLabels={toolsLabels}
    />
  );

  return (
    <DefaultPage
      title={t("team:TEAM_MEMBERS_TITLE")}
      description={t("team:TEAM_MEMBERS_DESC_LONG")}
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      extra={pageToolbar}
      action={
        <Button onClick={() => setInviteOpen(true)}>
          <Plus size={16} />
          {t("team:TEAM_INVITE_MEMBER")}
        </Button>
      }
    >
      <AdminDataTableSection
        table={table}
        emptyText={t("team:TEAM_EMPTY_TABLE")}
        emptyTitle={t("team:TEAM_EMPTY_TITLE")}
        emptyDescription={t("team:TEAM_EMPTY_DESC")}
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
        pageData={pageData}
        onPaginationChange={(nextPage, nextSize) => {
          if (nextSize !== table.getState().pagination.pageSize) {
            table.setPageSize(nextSize);
          }
          table.setPageIndex(Math.max(0, nextPage - 1));
        }}
        t={t}
        rowHeight={rowHeight}
        wrapHeaders={wrapHeaders}
        refreshing={tableHook.isFetching && !tableHook.isLoading}
      />

      <EditMemberRolesDialog
        open={Boolean(editingMember)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMember(null);
            setEditingRoleCode(null);
          }
        }}
        member={editingMember}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        value={editingRoleCode}
        onChange={setEditingRoleCode}
        confirmLoading={updateRolesMutation.isPending}
        confirmDisabled={!canEditRoles}
        onConfirm={() => {
          if (!editingMember) return;
          if (!canEditRoles) return;
          updateRolesMutation.mutate({
            membershipId: editingMember.membershipId,
            roleCodes: editingRoleCode ? [editingRoleCode] : [],
          });
        }}
      />

      <WorkspaceMemberContextDialog
        open={Boolean(inspectingMember)}
        onOpenChange={(open) => {
          if (!open) {
            setInspectingMember(null);
          }
        }}
        workspaceId={workspaceId ? String(workspaceId) : null}
        member={inspectingMember}
        currentUserId={currentUserId}
        onAdjustRoles={(member) => {
          setInspectingMember(null);
          setEditingMember(member);
          setEditingRoleCode(member.roleCodes?.[0] ?? null);
        }}
        onEnable={(membershipId) => enableMutation.mutate(membershipId)}
        onDisable={(membershipId) => disableMutation.mutate(membershipId)}
        rolesUpdateDisabled={rolesQueryFailed || rolesQuery.isLoading}
      />

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        mode="email"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() =>
          void queryClient.invalidateQueries({
            queryKey: teamMembersQueryKey(workspaceId ? String(workspaceId) : null),
          })
        }
      />
    </DefaultPage>
  );
}
