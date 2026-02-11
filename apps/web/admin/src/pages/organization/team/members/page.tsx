import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
import {
  Avatar,
  Button as AntButton,
  Dropdown,
  Input as AntInput,
  Select,
  Tag,
  Tooltip,
  Pagination,
} from "antd";
import type { MenuProps } from "antd";
import { Filter, MoreVertical, Plus, Search, Trash2, UserCog } from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import {
  deleteOrganizationMember,
  inviteOrganizationMember,
  listOrganizationMembers,
  patchOrganizationMemberRole,
  type OrgMembershipStatus,
  type OrgRole,
  type OrgUserStatus,
  type OrganizationMember,
  type OrganizationMemberWorkspace,
} from "@/api/organization-members";
import { listOrganizationRoles } from "@/api/organization-rbac";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { useDataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoaderOne } from "@/components/ui/loader";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@/lib/utils";

import {
  InviteOrganizationMemberDialog,
  type InviteOrganizationMemberFormValues,
  type InviteOrganizationRoleOption,
} from "../shared/invite-organization-member-dialog";
import { getOrganizationRoleDisplayName } from "../shared/role-i18n";

type OrgMemberFilters = {
  role?: OrgRole;
  membershipStatus?: OrgMembershipStatus;
  userStatus?: OrgUserStatus;
  hasWorkspace?: boolean;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function builtinRoleLabel(t: (key: string, opts?: Record<string, unknown>) => string, role: OrgRole): string {
  return t(`common:ORG_ROLE_${role.toUpperCase()}`);
}

function roleTagColor(role: OrgRole): string {
  if (role === "owner") return "gold";
  if (role === "admin") return "blue";
  return "default";
}

function membershipTagColor(status: OrgMembershipStatus): string {
  if (status === "active") return "green";
  if (status === "invited") return "blue";
  return "red";
}

function userTagColor(status: OrgUserStatus): string {
  if (status === "active") return "green";
  if (status === "disabled") return "red";
  return "gold";
}

function membershipLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  status: OrgMembershipStatus,
): string {
  if (status === "active") return t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE");
  if (status === "invited") return t("team:TEAM_MEMBERSHIP_STATUS_INVITED");
  return t("team:TEAM_MEMBERSHIP_STATUS_DISABLED");
}

function userStatusLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  status: OrgUserStatus,
): string {
  if (status === "active") return t("team:TEAM_USER_STATUS_ACTIVE");
  if (status === "disabled") return t("team:TEAM_USER_STATUS_DISABLED");
  return t("team:TEAM_USER_STATUS_LOCKED");
}

function WorkspaceAssociationPopover({
  workspaces,
}: {
  workspaces: OrganizationMemberWorkspace[];
}) {
  const { t } = useTranslation(["common", "team"]);

  if (!workspaces.length) {
    return <span className="text-sm text-muted-foreground">{t("common:NA")}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span>
            {t("common:ORG_MEMBERS_ASSOCIATED_WORKSPACES_COUNT", { count: workspaces.length })}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-[360px] max-w-[85vw] p-3">
        <div className="space-y-2">
          {workspaces.map((workspace) => (
            <div
              key={`${workspace.workspaceId}:${workspace.membershipStatus}`}
              className="rounded-md border px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{workspace.workspaceName}</div>
                <Tag color={membershipTagColor(workspace.membershipStatus)} style={{ marginInlineEnd: 0 }}>
                  {membershipLabel(t, workspace.membershipStatus)}
                </Tag>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">/{workspace.workspaceSlug}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(workspace.roleCodes.length ? workspace.roleCodes : ["-"]).map((code) => (
                  <Tag key={`${workspace.workspaceId}:${code}`} style={{ marginInlineEnd: 0 }}>
                    {code}
                  </Tag>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MembersFilterPopover({
  value,
  onChange,
}: {
  value: OrgMemberFilters;
  onChange: (next: OrgMemberFilters) => void;
}) {
  const { t } = useTranslation(["common", "team"]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <AntButton
          type="text"
          icon={<Filter size={18} />}
          title={t("common:ORG_MEMBERS_FILTER_TITLE")}
          style={{ height: 40 }}
          className="!bg-transparent hover:!bg-accent/40"
        >
          {t("common:ORG_MEMBERS_FILTER_TITLE")}
        </AntButton>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="font-bold">{t("common:ORG_MEMBERS_FILTER_TITLE")}</div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">{t("common:ORG_MEMBERS_TABLE_ROLE")}</div>
            <Select
              value={value.role ?? "all"}
              onChange={(next) =>
                onChange({
                  ...value,
                  role: next === "all" ? undefined : (next as OrgRole),
                })
              }
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "owner", label: t("common:ORG_ROLE_OWNER") },
                { value: "admin", label: t("common:ORG_ROLE_ADMIN") },
                { value: "member", label: t("common:ORG_ROLE_MEMBER") },
              ]}
              style={{ width: "100%" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">{t("common:ORG_MEMBERS_FILTER_MEMBER_STATUS")}</div>
            <Select
              value={value.membershipStatus ?? "all"}
              onChange={(next) =>
                onChange({
                  ...value,
                  membershipStatus: next === "all" ? undefined : (next as OrgMembershipStatus),
                })
              }
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "active", label: t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE") },
                { value: "invited", label: t("team:TEAM_MEMBERSHIP_STATUS_INVITED") },
                { value: "disabled", label: t("team:TEAM_MEMBERSHIP_STATUS_DISABLED") },
              ]}
              style={{ width: "100%" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">{t("common:ORG_MEMBERS_FILTER_USER_STATUS")}</div>
            <Select
              value={value.userStatus ?? "all"}
              onChange={(next) =>
                onChange({
                  ...value,
                  userStatus: next === "all" ? undefined : (next as OrgUserStatus),
                })
              }
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "active", label: t("team:TEAM_USER_STATUS_ACTIVE") },
                { value: "disabled", label: t("team:TEAM_USER_STATUS_DISABLED") },
                { value: "locked", label: t("team:TEAM_USER_STATUS_LOCKED") },
              ]}
              style={{ width: "100%" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-sm text-muted-foreground">
              {t("common:ORG_MEMBERS_FILTER_WORKSPACE_ASSOCIATION")}
            </div>
            <Select
              value={
                value.hasWorkspace === undefined
                  ? "all"
                  : value.hasWorkspace
                    ? "with_workspace"
                    : "without_workspace"
              }
              onChange={(next) =>
                onChange({
                  ...value,
                  hasWorkspace:
                    next === "all" ? undefined : next === "with_workspace" ? true : false,
                })
              }
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "with_workspace", label: t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITH") },
                {
                  value: "without_workspace",
                  label: t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITHOUT"),
                },
              ]}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <AntButton onClick={() => onChange({})}>{t("team:TEAM_FILTER_RESET")}</AntButton>
          <PopoverClose asChild>
            <AntButton type="primary">{t("team:TEAM_FILTER_DONE")}</AntButton>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function OrganizationTeamMembersPage() {
  const { t } = useTranslation(["nav", "common", "team"]);
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [filters, setFilters] = useState<OrgMemberFilters>({});
  const [pendingRemove, setPendingRemove] = useState<OrganizationMember | null>(null);
  const [editingRoleMember, setEditingRoleMember] = useState<OrganizationMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>("member");

  const rolesQuery = useQuery({
    queryKey: ["organization", "rbac", "roles"],
    queryFn: async () => listOrganizationRoles({ size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => authApi.me(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const currentUserId = meQuery.data?.id ? String(meQuery.data.id) : null;

  const roleNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of rolesQuery.data?.items ?? []) {
      map.set(role.code, getOrganizationRoleDisplayName(t, role.code, role.name));
    }
    map.set("owner", getOrganizationRoleDisplayName(t, "owner", map.get("owner")));
    map.set("admin", getOrganizationRoleDisplayName(t, "admin", map.get("admin")));
    map.set("member", getOrganizationRoleDisplayName(t, "member", map.get("member")));
    return map;
  }, [rolesQuery.data?.items, t]);

  const roleOptions = useMemo<InviteOrganizationRoleOption[]>(() => {
    const fromApi = (rolesQuery.data?.items ?? []).map((role) => ({
      value: role.code,
      label: getOrganizationRoleDisplayName(t, role.code, role.name),
    }));
    if (fromApi.length) return fromApi;
    return [
      { value: "owner", label: t("common:ORG_ROLE_OWNER") },
      { value: "admin", label: t("common:ORG_ROLE_ADMIN") },
      { value: "member", label: t("common:ORG_ROLE_MEMBER") },
    ];
  }, [rolesQuery.data?.items, t]);

  const defaultRoleCode = roleOptions.some((option) => option.value === "member")
    ? "member"
    : (roleOptions[0]?.value ?? "member");

  const inviteMutation = useMutation({
    mutationFn: async (payload: InviteOrganizationMemberFormValues) =>
      inviteOrganizationMember({
        email: payload.email,
        roleCode: payload.roleCode,
        expiresInSeconds: payload.expiresInSeconds ?? undefined,
      }),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_INVITE_SUCCESS"));
      setInviteOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-team-members"] }),
        queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invitations:pending"] }),
        queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invitations:processed"] }),
      ]);
    },
    onError: (err) => notifyError(err),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (payload: { membershipId: string; roleCode: string }) =>
      patchOrganizationMemberRole(payload.membershipId, { roleCode: payload.roleCode }),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setEditingRoleMember(null);
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-team-members"] });
    },
    onError: (err) => notifyError(err),
  });

  const removeMutation = useMutation({
    mutationFn: async (membershipId: string) => deleteOrganizationMember(membershipId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setPendingRemove(null);
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-team-members"] });
    },
    onError: (err) => notifyError(err),
  });

  const columns = useMemo<Array<ColumnDef<OrganizationMember, unknown>>>(
    () => [
      {
        id: "member",
        header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        cell: ({ row }) => {
          const item = row.original;
          const primary = item.displayName || item.username;
          const secondary = item.email || "-";
          const isOwnerSelf = item.role === "owner" && currentUserId !== null && item.userId === currentUserId;

          const removeMenuLabel = isOwnerSelf ? (
            <Tooltip title={t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}>
              <span>{t("common:DELETE")}</span>
            </Tooltip>
          ) : (
            t("common:DELETE")
          );

          const menuItems: MenuProps["items"] = [
            {
              key: "change_role",
              icon: <UserCog className="size-4" />,
              label: t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE"),
              onClick: () => {
                setEditingRoleMember(item);
                setRoleDraft(item.roleCode || item.role);
              },
            },
            { type: "divider" },
            {
              key: "remove",
              icon: <Trash2 className="size-4" />,
              label: removeMenuLabel,
              danger: true,
              disabled: isOwnerSelf,
              onClick: () => {
                if (isOwnerSelf) return;
                setPendingRemove(item);
              },
            },
          ];

          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                size={28}
                shape="square"
                src={item.avatarUrl ?? undefined}
                style={{
                  backgroundColor: "var(--color-muted)",
                  color: "var(--color-foreground)",
                  flexShrink: 0,
                }}
              >
                {primary.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{primary}</div>
                <div className="truncate text-xs text-muted-foreground">{secondary}</div>
              </div>

              <div className="ml-auto pl-2">
                <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                  <Button variant="ghost" className="h-8 w-8 p-0" aria-label={t("team:TEAM_USER_ACTIONS")}>
                    <MoreVertical className="size-4" />
                  </Button>
                </Dropdown>
              </div>
            </div>
          );
        },
      },
      {
        id: "workspaces",
        header: t("common:ORG_MEMBERS_TABLE_WORKSPACES"),
        cell: ({ row }) => <WorkspaceAssociationPopover workspaces={row.original.workspaces} />,
      },
      {
        id: "status",
        header: t("common:ORG_MEMBERS_TABLE_STATUS"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-wrap gap-1">
              <Tag color={membershipTagColor(item.status)} style={{ marginInlineEnd: 0 }}>
                {membershipLabel(t, item.status)}
              </Tag>
              <Tag color={userTagColor(item.userStatus)} style={{ marginInlineEnd: 0 }}>
                {userStatusLabel(t, item.userStatus)}
              </Tag>
            </div>
          );
        },
      },
      {
        id: "role",
        header: t("common:ORG_MEMBERS_TABLE_ROLE"),
        cell: ({ row }) => (
          <Tag color={roleTagColor(row.original.role)} style={{ marginInlineEnd: 0 }}>
            {roleNameByCode.get(row.original.roleCode) || builtinRoleLabel(t, row.original.role)}
          </Tag>
        ),
      },
      {
        id: "joined",
        header: t("common:ORG_MEMBERS_TABLE_JOINED_AT"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.joinedAt)}</span>
        ),
      },
      {
        id: "lastLogin",
        header: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.lastLoginAt)}</span>
        ),
      },
    ],
    [currentUserId, roleNameByCode, t],
  );

  const tableHook = useDataTable<OrganizationMember>({
    tableId: "organization-team-members",
    columns,
    initialState: { pageSize: 10 },
    extraQuery: {
      role: filters.role,
      membershipStatus: filters.membershipStatus,
      userStatus: filters.userStatus,
      hasWorkspace: filters.hasWorkspace,
    },
    fetcher: async (params) =>
      listOrganizationMembers({
        page: params.page,
        size: params.size,
        q: params.q,
        role: params.role as OrgRole | undefined,
        membershipStatus: params.membershipStatus as OrgMembershipStatus | undefined,
        userStatus: params.userStatus as OrgUserStatus | undefined,
        hasWorkspace: params.hasWorkspace as boolean | undefined,
      }),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const table = tableHook.table;
  const pageData = tableHook.pageData;
  const empty = !tableHook.isLoading && tableHook.items.length === 0;

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_SETTINGS_TEAM_MEMBER_LIST")}
      description={t("common:ORG_MEMBERS_DESC")}
      contentClassName="min-h-0"
      action={
        <AntButton type="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
          {t("common:ORG_MEMBERS_INVITE")}
        </AntButton>
      }
      extra={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <AntInput
              variant="borderless"
              value={tableHook.searchInput}
              onChange={(event) => tableHook.setSearchInput(event.target.value)}
              placeholder={t("common:ORG_MEMBERS_SEARCH_PLACEHOLDER")}
              allowClear
              prefix={<Search className="size-4 text-muted-foreground" />}
              style={{ width: 360, maxWidth: "100%" }}
            />

            <MembersFilterPopover value={filters} onChange={setFilters} />
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
        emptyTitle={t("common:ORG_MEMBERS_EMPTY_TITLE")}
        emptyDescription={t("common:ORG_MEMBERS_EMPTY_DESC")}
      >
        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row, rowIndex) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background",
                    "transition-colors hover:bg-muted/40",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>


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
      </PageState>

      <InviteOrganizationMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        loading={inviteMutation.isPending}
        roleOptions={roleOptions}
        defaultRoleCode={defaultRoleCode}
        onSubmit={async (values) => {
          await inviteMutation.mutateAsync(values);
        }}
      />

      <Dialog
        open={Boolean(editingRoleMember)}
        onOpenChange={(open) => {
          if (!open) setEditingRoleMember(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE")}</DialogTitle>
            <DialogDescription>
              {t("common:ORG_MEMBERS_ROLE_DIALOG_DESC", {
                name: editingRoleMember?.displayName || editingRoleMember?.username || "",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-foreground">{t("common:ORG_MEMBERS_INVITE_ROLE")}</label>
            <Select
              value={roleDraft}
              onChange={(next) => setRoleDraft(String(next))}
              options={roleOptions}
              style={{ width: "100%" }}
              disabled={updateRoleMutation.isPending}
            />
          </div>

          <DialogFooter>
            <AntButton onClick={() => setEditingRoleMember(null)} disabled={updateRoleMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={updateRoleMutation.isPending}
              onClick={async () => {
                if (!editingRoleMember) return;
                await updateRoleMutation.mutateAsync({
                  membershipId: editingRoleMember.membershipId,
                  roleCode: roleDraft,
                });
              }}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("common:ORG_MEMBERS_REMOVE_CONFIRM_TITLE")}
        description={t("common:ORG_MEMBERS_REMOVE_CONFIRM_DESC", {
          name: pendingRemove?.displayName || pendingRemove?.username || "",
        })}
        cancelText={t("common:CANCEL")}
        confirmText={t("common:CONFIRM")}
        danger
        loading={removeMutation.isPending}
        onConfirm={async () => {
          if (!pendingRemove) return;
          await removeMutation.mutateAsync(pendingRemove.membershipId);
        }}
      />
    </DefaultPage>
  );
}
