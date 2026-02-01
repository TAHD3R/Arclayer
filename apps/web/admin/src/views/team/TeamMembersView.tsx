import {
  Avatar,
  Dropdown,
  Button as AntButton,
  Input as AntInput,
  Modal,
  Pagination,
  Select,
  Tag,
} from "antd";
import {
  KeyRound,
  MoreVertical,
  Pencil,
  Plus,
  UserCheck,
  UserCog,
  UserX,
  Search,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
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
  type TeamMember,
  type UserStatus,
} from "@/api/team";
import { DefaultPage } from "@/components/app/defaultPage";
import { PageState } from "@/components/app/pageState";
import { useDataTable } from "@/components/customized/table";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoaderOne } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import {
  TeamMembersFilterPopover,
  type TeamMemberSort,
} from "@/views/team/components/TeamMembersFilterPopover";
import { useAuthStore } from "@/stores/useAuthStore";
import { EditUserSheet } from "@/views/team/components/EditUserSheet";
import { ResetUserPasswordDialog } from "@/views/team/components/ResetUserPasswordDialog";
import { InviteMembersDialog } from "@/views/team/components/InviteMembersDialog";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

function userInitials(member: TeamMember): string {
  const label = (member.displayName || member.username || member.email || "U").trim();
  return label.slice(0, 1).toUpperCase();
}

function formatLastLogin(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function userStatusTagColor(status: UserStatus): string {
  if (status === "active") return "green";
  if (status === "disabled") return "red";
  return "gold";
}

export function TeamMembersView() {
  const { t } = useTranslation(["team", "common"]);

  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [filters, setFilters] = React.useState<{
    membershipStatus?: "active" | "invited" | "disabled";
    userStatus?: UserStatus;
    roleCode?: string;
  }>({});

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
  const rolesQueryFailed = rolesQuery.isError;

  const roleNameByCode = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rolesQuery.data?.items ?? []) {
      map.set(r.code, r.name || r.code);
    }
    return map;
  }, [rolesQuery.data?.items]);

  const [editingMember, setEditingMember] = React.useState<TeamMember | null>(null);
  const [editingRoleCodes, setEditingRoleCodes] = React.useState<string[]>([]);
  const canEditRoles = Boolean(editingMember) && editingMember?.membershipStatus === "active";

  const [editUserOpen, setEditUserOpen] = React.useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = React.useState(false);
  const [activeMember, setActiveMember] = React.useState<TeamMember | null>(null);

  const extraQuery = React.useMemo(
    () => ({
      status: filters.membershipStatus,
      userStatus: filters.userStatus,
      roleCode: filters.roleCode,
    }),
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
        queryKey: ["dataTable", workspaceId ? `team-members:${workspaceId}` : "team-members"],
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
        queryKey: ["dataTable", workspaceId ? `team-members:${workspaceId}` : "team-members"],
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
        queryKey: ["dataTable", workspaceId ? `team-members:${workspaceId}` : "team-members"],
      });
      setEditingMember(null);
      setEditingRoleCodes([]);
    },
    onError: (err) => notifyError(err),
  });

  const columns = React.useMemo<ColumnDef<TeamMember, unknown>[]>(() => {
    const cols: ColumnDef<TeamMember, unknown>[] = [
      {
        id: "user",
        meta: { title: t("team:TEAM_TABLE_COL_USER") },
        header: t("team:TEAM_TABLE_COL_USER"),
        cell: ({ row }) => {
          const m = row.original;
          const primary = (m.displayName || m.username || m.email || "-").trim() || "-";
          const secondary = m.email || m.username || "";
          const canEnable = m.userStatus !== "active";
          const canDisable = m.userStatus === "active";
          const isSelf = currentUserId ? String(currentUserId) === String(m.userId) : false;
          const canEditMemberRoles = m.membershipStatus === "active";

          const menuItems: MenuProps["items"] = [
            {
              key: "edit_user",
              icon: <Pencil className="size-4" />,
              label: t("team:TEAM_ACTION_EDIT_USER"),
              onClick: () => {
                setActiveMember(m);
                setEditUserOpen(true);
              },
            },
            {
              key: "reset_password",
              icon: <KeyRound className="size-4" />,
              label: t("team:TEAM_ACTION_RESET_PASSWORD"),
              onClick: () => {
                setActiveMember(m);
                setResetPasswordOpen(true);
              },
            },
            { type: "divider" },
            {
              key: "edit_roles",
              icon: <UserCog className="size-4" />,
              label: t("team:TEAM_ACTION_EDIT_ROLES"),
              disabled: !canEditMemberRoles || rolesQueryFailed,
              onClick: () => {
                setEditingMember(m);
                setEditingRoleCodes(m.roleCodes ?? []);
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
                shape="square"
                src={m.avatarUrl || undefined}
                style={{
                  backgroundColor: "var(--color-muted)",
                  color: "var(--color-foreground)",
                  flexShrink: 0,
                }}
              >
                {userInitials(m)}
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium truncate">{primary}</div>
                {secondary ? (
                  <div className="text-muted-foreground text-xs truncate">{secondary}</div>
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
        accessorKey: "email",
        meta: { title: t("team:TEAM_TABLE_COL_EMAIL") },
        header: t("team:TEAM_TABLE_COL_EMAIL"),
        cell: ({ row }) => {
          const v = row.original.email;
          return <span className={v ? "" : "text-muted-foreground"}>{v || "-"}</span>;
        },
      },
      {
        id: "roles",
        meta: { title: t("team:TEAM_TABLE_COL_ROLES") },
        header: () => <span>{t("team:TEAM_TABLE_COL_ROLES")}</span>,
        cell: ({ row }) => {
          const codes = row.original.roleCodes ?? [];
          if (!codes.length) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {codes.slice(0, 3).map((code) => (
                <Tag key={code} style={{ marginInlineEnd: 0 }}>
                  {roleNameByCode.get(code) ?? code}
                </Tag>
              ))}
              {codes.length > 3 ? (
                <span className="text-muted-foreground text-xs">
                  {t("team:TEAM_MORE_ROLES", { count: codes.length - 3 })}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "userStatus",
        meta: { title: t("team:TEAM_TABLE_COL_STATUS") },
        header: t("team:TEAM_TABLE_COL_STATUS"),
        cell: ({ row }) => {
          const s = row.original.userStatus;
          return (
            <Tag color={userStatusTagColor(s)} style={{ marginInlineEnd: 0 }}>
              {s === "active"
                ? t("team:TEAM_USER_STATUS_ACTIVE")
                : s === "disabled"
                  ? t("team:TEAM_USER_STATUS_DISABLED")
                  : t("team:TEAM_USER_STATUS_LOCKED")}
            </Tag>
          );
        },
      },
      {
        accessorKey: "lastLoginAt",
        meta: { title: t("team:TEAM_TABLE_COL_LAST_LOGIN") },
        header: t("team:TEAM_TABLE_COL_LAST_LOGIN"),
        cell: ({ row }) => {
          const formatted = formatLastLogin(row.original.lastLoginAt);
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {formatted || t("team:TEAM_LAST_LOGIN_NEVER")}
            </span>
          );
        },
      },
    ];
    return cols;
  }, [currentUserId, roleNameByCode, rolesQueryFailed, t]);

  const tableHook = useDataTable<
    TeamMember,
    { status?: string; userStatus?: UserStatus; roleCode?: string }
  >({
    tableId: workspaceId ? `team-members:${workspaceId}` : "team-members",
    columns,
    extraQuery,
    orderingOverride: sort,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      workspaceId
        ? listTeamMembers(String(workspaceId), {
            page: params.page,
            size: params.size,
            q: params.q,
            ordering: params.ordering,
            status: params.status as any,
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
      width="full"
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      action={
        <AntButton type="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
          {t("team:TEAM_INVITE_MEMBER")}
        </AntButton>
      }
      extra={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <AntInput
              variant="borderless"
              value={tableHook.searchInput}
              onChange={(e) => tableHook.setSearchInput(e.target.value)}
              placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
              allowClear
              prefix={<Search className="size-4 text-muted-foreground" />}
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
              onSortChange={setSort}
              defaultSort="-created_at"
            />
          </div>

          {tableHook.isFetching && !tableHook.isLoading ? <LoaderOne /> : null}
        </div>
      }
    >
      <PageState
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
        empty={empty}
        loadingVariant="table"
        emptyTitle={t("team:TEAM_EMPTY_TITLE")}
        emptyDescription={t("team:TEAM_EMPTY_DESC")}
        className="flex-1 min-h-0"
      >
        <div className="rounded-md border overflow-auto flex-1 min-h-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        header.column.id === "user"
                          ? "sticky left-0 z-20 bg-background min-w-72 w-72"
                          : undefined,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row, rowIndex) => {
                  const stripeClass = rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background";
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(stripeClass, "hover:bg-muted/40 transition-colors")}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            cell.column.id === "user"
                              ? "sticky left-0 z-10 min-w-72 w-72"
                              : undefined,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={columns.length}
                  >
                    {t("team:TEAM_EMPTY_TABLE")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <Modal
          title={t("team:TEAM_EDIT_ROLES_TITLE")}
          open={Boolean(editingMember)}
          okButtonProps={{ disabled: !canEditRoles, loading: updateRolesMutation.isPending }}
          onCancel={() => {
            setEditingMember(null);
            setEditingRoleCodes([]);
          }}
          onOk={() => {
            if (!editingMember) return;
            if (!canEditRoles) return;
            updateRolesMutation.mutate({
              membershipId: editingMember.membershipId,
              roleCodes: editingRoleCodes,
            });
          }}
        >
          <div className="grid grid-cols-1 gap-2">
            <div className="text-sm text-muted-foreground">{t("team:TEAM_EDIT_ROLES_DESC")}</div>
            <Select
              mode="multiple"
              allowClear
              placeholder={t("team:TEAM_EDIT_ROLES_PLACEHOLDER")}
              loading={rolesQuery.isLoading}
              value={editingRoleCodes}
              onChange={(next) => setEditingRoleCodes(next)}
              options={(rolesQuery.data?.items ?? []).map((r) => ({
                label: r.name || r.code,
                value: r.code,
              }))}
              showSearch
              optionFilterProp="label"
            />
          </div>
        </Modal>

        {pageData ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="text-muted-foreground text-sm">
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

        <EditUserSheet
          open={editUserOpen}
          onOpenChange={(open) => {
            setEditUserOpen(open);
            if (!open) setActiveMember(null);
          }}
          member={activeMember}
          onSaved={() =>
            void queryClient.invalidateQueries({
              queryKey: ["dataTable", workspaceId ? `team-members:${workspaceId}` : "team-members"],
            })
          }
        />

        <ResetUserPasswordDialog
          open={resetPasswordOpen}
          onOpenChange={(open) => {
            setResetPasswordOpen(open);
            if (!open) setActiveMember(null);
          }}
          member={activeMember}
          onReset={() =>
            void queryClient.invalidateQueries({
              queryKey: ["dataTable", workspaceId ? `team-members:${workspaceId}` : "team-members"],
            })
          }
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
              queryKey: ["dataTable", workspaceId ? `team-members:${workspaceId}` : "team-members"],
            })
          }
        />
      </PageState>
    </DefaultPage>
  );
}
