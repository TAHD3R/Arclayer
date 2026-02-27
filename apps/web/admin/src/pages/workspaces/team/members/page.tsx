import { Avatar, Dropdown, Button as AntButton, Input as AntInput, Pagination, Tag } from "antd";
import { MoreVertical, Plus, UserCheck, UserCog, UserX, Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef, type SortingState } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuProps } from "antd";

import * as authApi from "@/api/auth";
import { listMyWorkspaces } from "@/api/workspaces";
import { listWorkspaceRoles } from "@/api/rbac";
import {
  disableTeamMember,
  enableTeamMember,
  listTeamMembers,
  setTeamMemberRoles,
} from "@/api/team";
import type { TeamMember, UserStatus } from "@/types/api";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { useDataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { LoaderOne } from "@/components/ui/loader";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  TeamMembersFilterPopover,
  type TeamMemberSort,
} from "@/components/common/team/team-members-filter-popover";
import { useAuthStore } from "@/stores/use-auth-store";
import { InviteMembersDialog } from "@/components/common/team/invite-members-dialog";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { EditMemberRolesDialog } from "@/components/common/team/edit-member-roles-dialog";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { TeamMembersDataTable } from "./members-data-table";
import {
  membershipStatusTagColor,
  teamMembersQueryKey,
  teamMembersTableId,
  buildTeamMemberExtraQuery,
  resolveWorkspaceName,
  type TeamMemberExtraQuery,
  type TeamMemberFilters,
  userInitials,
  userStatusTagColor,
} from "./helpers";

function sortValueToTableSorting(value: TeamMemberSort): SortingState {
  if (value === "user__username") return [{ id: "user", desc: false }];
  if (value === "-user__username") return [{ id: "user", desc: true }];
  if (value === "user__last_login_at") return [{ id: "lastLoginAt", desc: false }];
  if (value === "-user__last_login_at") return [{ id: "lastLoginAt", desc: true }];
  if (value === "status") return [{ id: "userStatus", desc: false }];
  if (value === "-status") return [{ id: "userStatus", desc: true }];
  return [];
}

function tableSortingToSortValue(sorting: SortingState): TeamMemberSort | null {
  const [first] = sorting;
  if (!first) return null;

  if (first.id === "user") return first.desc ? "-user__username" : "user__username";
  if (first.id === "lastLoginAt") {
    return first.desc ? "-user__last_login_at" : "user__last_login_at";
  }
  if (first.id === "userStatus") return first.desc ? "-status" : "status";

  return null;
}

export function TeamMembersPage() {
  const { t } = useTranslation(["team", "common"]);

  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [filters, setFilters] = React.useState<TeamMemberFilters>({});

  const [sort, setSort] = React.useState<TeamMemberSort>("-created_at");

  const [inviteOpen, setInviteOpen] = React.useState(false);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const currentUserId = meQuery.data?.id ?? null;

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces"],
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
        },
        header: t("team:TEAM_TABLE_COL_USER"),
        cell: ({ row }) => {
          const m = row.original;
          const primary = (m.displayName || m.username || m.email || "-").trim() || "-";
          const secondary = m.email || m.username || "";
          const canEnable = m.membershipStatus === "disabled";
          const canDisable = m.membershipStatus === "active";
          const isSelf = currentUserId ? String(currentUserId) === String(m.userId) : false;
          const canEditMemberRoles = m.membershipStatus === "active";

          const menuItems: MenuProps["items"] = [
            {
              key: "edit_roles",
              icon: <UserCog className="size-4" />,
              label: t("team:TEAM_ACTION_EDIT_ROLES"),
              disabled: !canEditMemberRoles || rolesQueryFailed,
              onClick: () => {
                setEditingMember(m);
                setEditingRoleCode(m.roleCodes?.[0] ?? null);
              },
            },
            { type: "divider" },
            {
              key: "enable",
              icon: <UserCheck className="size-4" />,
              label: t("team:TEAM_ACTION_ENABLE"),
              disabled: !canEnable,
              onClick: () => enableMutation.mutate(m.membershipId),
            },
            {
              key: "disable",
              icon: <UserX className="size-4" />,
              label: isSelf
                ? t("team:TEAM_ACTION_DISABLE_SELF_DISABLED")
                : t("team:TEAM_ACTION_DISABLE"),
              disabled: !canDisable || isSelf,
              onClick: () => {
                if (isSelf) return;
                disableMutation.mutate(m.membershipId);
              },
            },
          ];

          return (
            <div className="flex items-center gap-3">
              <Avatar
                size={28}
                src={resolveAssetRefToPublicUrlPath(m.avatarUrl) || undefined}
                className="shrink-0"
              >
                {userInitials(m)}
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{primary}</div>
                {secondary ? (
                  <div className="text-label-secondary text-caption truncate">{secondary}</div>
                ) : null}
              </div>

              <div className="ml-auto pl-2">
                <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    aria-label={t("team:TEAM_USER_ACTIONS")}
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </Dropdown>
              </div>
            </div>
          );
        },
      },
      {
        id: "roles",
        meta: { title: t("team:TEAM_TABLE_COL_ROLES") },
        header: () => <span>{t("team:TEAM_TABLE_COL_ROLES")}</span>,
        cell: ({ row }) => {
          const codes = row.original.roleCodes ?? [];
          if (!codes.length) return <span className="text-label-secondary">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {codes.slice(0, 3).map((code) => (
                <Tag key={code} className="mr-0!">
                  {roleNameByCode.get(code) ?? code}
                </Tag>
              ))}
              {codes.length > 3 ? (
                <span className="text-label-secondary text-caption">
                  {t("team:TEAM_MORE_ROLES", { count: codes.length - 3 })}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "userStatus",
        meta: {
          title: t("team:TEAM_TABLE_COL_STATUS"),
          sortKey: "status",
        },
        header: t("team:TEAM_TABLE_COL_STATUS"),
        cell: ({ row }) => {
          const membership = row.original.membershipStatus;
          const user = row.original.userStatus;
          const isNormal = membership === "active" && user === "active";
          return (
            <div className="flex flex-wrap items-center gap-1">
              <Tag color={membershipStatusTagColor(membership)} className="mr-0!">
                {membership === "active"
                  ? t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE")
                  : membership === "invited"
                    ? t("team:TEAM_MEMBERSHIP_STATUS_INVITED")
                    : t("team:TEAM_MEMBERSHIP_STATUS_DISABLED")}
              </Tag>
              {!isNormal && (
                <Tag color={userStatusTagColor(user)} className="mr-0!">
                  {user === "active"
                    ? t("team:TEAM_USER_STATUS_ACTIVE")
                    : user === "disabled"
                      ? t("team:TEAM_USER_STATUS_DISABLED")
                      : t("team:TEAM_USER_STATUS_LOCKED")}
                </Tag>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "lastLoginAt",
        meta: {
          title: t("team:TEAM_TABLE_COL_LAST_LOGIN"),
          sortKey: "user__last_login_at",
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
      },
    ];
    return cols;
  }, [currentUserId, dateTime, roleNameByCode, rolesQueryFailed, t]);

  const tableHook = useDataTable<
    TeamMember,
    { status?: TeamMember["membershipStatus"]; userStatus?: UserStatus; roleCode?: string }
  >({
    tableId: teamMembersTableId(workspaceId ? String(workspaceId) : null),
    columns,
    extraQuery,
    orderingOverride: sort,
    initialState: { pageSize: 10 },
    onSortingChange: (nextSorting) => {
      const mapped = tableSortingToSortValue(nextSorting);
      setSort(mapped ?? "-created_at");
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

  const empty = !tableHook.isLoading && tableHook.items.length === 0;
  const table = tableHook.table;
  const pageData = tableHook.pageData;

  return (
    <DefaultPage
      title={t("team:TEAM_MEMBERS_TITLE")}
      description={t("team:TEAM_MEMBERS_DESC_LONG")}
      width="fixed"
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      action={
        <AntButton type="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
          {t("team:TEAM_INVITE_MEMBER")}
        </AntButton>
      }
      extra={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AntInput
              variant="borderless"
              value={tableHook.searchInput}
              onChange={(e) => tableHook.setSearchInput(e.target.value)}
              placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
              allowClear
              prefix={<Search className="size-4 text-label-secondary" />}
              style={{ width: 360, maxWidth: "100%" }}
            />

            <TeamMembersFilterPopover
              value={{
                membershipStatus: filters.membershipStatus,
                userStatus: filters.userStatus,
                roleCode: filters.roleCode,
              }}
              onChange={(next) =>
                setFilters({
                  membershipStatus: next.membershipStatus,
                  userStatus: next.userStatus,
                  roleCode: next.roleCode,
                })
              }
              roles={rolesQuery.data?.items ?? []}
              rolesLoading={rolesQuery.isLoading}
              sort={sort}
              onSortChange={(next) => {
                setSort(next);
                tableHook.setSorting(sortValueToTableSorting(next));
              }}
              defaultSort="-created_at"
            />
          </div>

          {tableHook.isFetching && !tableHook.isLoading ? <LoaderOne /> : null}
        </div>
      }
    >
      <ContentGuard
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
        empty={empty}
        loadingVariant="table"
        emptyTitle={t("team:TEAM_EMPTY_TITLE")}
        emptyDescription={t("team:TEAM_EMPTY_DESC")}
        className="flex-1 min-h-0"
      >
        <TeamMembersDataTable table={table} emptyText={t("team:TEAM_EMPTY_TABLE")} />

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

        {pageData ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="text-label-secondary text-footnote">
              {t("team:TEAM_PAGINATION_TOTAL", {
                total: pageData.total,
                from: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
                to: Math.min(pageData.page * pageData.size, pageData.total),
              })}
            </div>
            <Pagination
              current={pageData.page}
              pageSize={pageData.size}
              total={pageData.total}
              showSizeChanger
              pageSizeOptions={[10, 20, 50, 100]}
              onChange={(nextPage, nextSize) => {
                if (
                  typeof nextSize === "number" &&
                  nextSize !== table.getState().pagination.pageSize
                ) {
                  table.setPageSize(nextSize);
                }
                table.setPageIndex(Math.max(0, nextPage - 1));
              }}
            />
          </div>
        ) : null}

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
      </ContentGuard>
    </DefaultPage>
  );
}
