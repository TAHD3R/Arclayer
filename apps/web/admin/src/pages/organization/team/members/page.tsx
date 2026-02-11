import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
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
import { Eye, Filter, MoreVertical, Plus, Search, Trash2, UserCog } from "lucide-react";
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
import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import {
  getOrganizationRbacMatrix,
  listOrganizationRoles,
  type OrganizationRbacMatrixPermissionRow,
} from "@/api/organization-rbac";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { useDataTable } from "@/components/data-table";
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
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@/lib/utils";

import {
  InviteOrganizationMemberDialog,
  type InviteOrganizationMemberFormValues,
  type InviteOrganizationRoleOption,
} from "../shared/invite-organization-member-dialog";
import { OrganizationMemberInspectSheet } from "../shared/organization-member-inspect-sheet";
import {
  type ResolvedMemberWorkspace,
  OrganizationMemberWorkspaceList,
} from "../shared/organization-member-workspace-list";
import { getOrganizationRoleDisplayName } from "../shared/role-i18n";

type OrgMemberFilters = {
  role?: OrgRole;
  membershipStatus?: OrgMembershipStatus;
  userStatus?: OrgUserStatus;
  hasWorkspace?: boolean;
};

type DisplayOrganizationPermission = OrganizationRbacMatrixPermissionRow & {
  displayName: string;
  displayDescription: string | null;
};

const ORG_PERMISSION_COPY_MAP: Record<string, { nameKey: string; descKey: string }> = {
  "org.members.read": {
    nameKey: "ORG_ROLE_PERMISSION_MEMBERS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_MEMBERS_VIEW_DESC",
  },
  "org.members.manage": {
    nameKey: "ORG_ROLE_PERMISSION_MEMBERS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_MEMBERS_MANAGE_DESC",
  },
  "org.invitations.read": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_INVITES_VIEW_DESC",
  },
  "org.invitations.create": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_CREATE",
    descKey: "ORG_ROLE_PERMISSION_INVITES_CREATE_DESC",
  },
  "org.invitations.revoke": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_REVOKE",
    descKey: "ORG_ROLE_PERMISSION_INVITES_REVOKE_DESC",
  },
  "org.roles.read": {
    nameKey: "ORG_ROLE_PERMISSION_ROLES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_ROLES_VIEW_DESC",
  },
  "org.roles.write": {
    nameKey: "ORG_ROLE_PERMISSION_ROLES_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_ROLES_MANAGE_DESC",
  },
  "org.workspaces.read": {
    nameKey: "ORG_ROLE_PERMISSION_WORKSPACES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_WORKSPACES_VIEW_DESC",
  },
  "org.workspaces.manage": {
    nameKey: "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE_DESC",
  },
  "org.settings.read": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_VIEW_DESC",
  },
  "org.settings.manage": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_MANAGE_DESC",
  },
  "org.plugins.read": {
    nameKey: "ORG_ROLE_PERMISSION_PLUGINS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_PLUGINS_VIEW_DESC",
  },
  "org.plugins.manage": {
    nameKey: "ORG_ROLE_PERMISSION_PLUGINS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_PLUGINS_MANAGE_DESC",
  },
  "org.activity.read": {
    nameKey: "ORG_ROLE_PERMISSION_ACTIVITY_VIEW",
    descKey: "ORG_ROLE_PERMISSION_ACTIVITY_VIEW_DESC",
  },
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
  roleNameByCode,
  onEnterWorkspace,
}: {
  workspaces: ResolvedMemberWorkspace[];
  roleNameByCode: Map<string, string>;
  onEnterWorkspace: (workspaceId: string) => void;
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

      <PopoverContent align="start" sideOffset={8} className="w-[420px] max-w-[90vw] p-3">
        <div className="space-y-3">
          <div>
            <div className="font-semibold">{t("common:ORG_MEMBERS_WORKSPACE_POPOVER_TITLE")}</div>
            <div className="text-muted-foreground">{t("common:ORG_MEMBERS_WORKSPACE_POPOVER_DESC")}</div>
          </div>

          <div className="max-h-[420px] overflow-auto pr-1">
            <OrganizationMemberWorkspaceList
              workspaces={workspaces}
              roleNameByCode={roleNameByCode}
              onEnterWorkspace={onEnterWorkspace}
              searchable
            />
          </div>
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
  const navigate = useNavigate();
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [filters, setFilters] = useState<OrgMemberFilters>({});
  const [pendingRemove, setPendingRemove] = useState<OrganizationMember | null>(null);
  const [editingRoleMember, setEditingRoleMember] = useState<OrganizationMember | null>(null);
  const [inspectingMember, setInspectingMember] = useState<OrganizationMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>("member");
  const roleDialogPopupRef = useRef<HTMLDivElement | null>(null);

  const rolesQuery = useQuery({
    queryKey: ["organization", "rbac", "roles"],
    queryFn: async () => listOrganizationRoles({ size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const matrixQuery = useQuery({
    queryKey: ["organization", "rbac", "matrix", "members-page"],
    queryFn: async () => getOrganizationRbacMatrix(),
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

  const activeWorkspacesQuery = useQuery({
    queryKey: ["organization", "workspaces", "active", "members-page"],
    queryFn: async () => listOrganizationWorkspaces({ page: 1, size: 200, archived: false }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const archivedWorkspacesQuery = useQuery({
    queryKey: ["organization", "workspaces", "archived", "members-page"],
    queryFn: async () => listOrganizationWorkspaces({ page: 1, size: 200, archived: true }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceMetaById = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; description: string | null; iconUrl: string | null }>();
    for (const workspace of activeWorkspacesQuery.data?.items ?? []) {
      map.set(workspace.workspaceId, {
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        iconUrl: workspace.iconUrl,
      });
    }
    for (const workspace of archivedWorkspacesQuery.data?.items ?? []) {
      map.set(workspace.workspaceId, {
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        iconUrl: workspace.iconUrl,
      });
    }
    return map;
  }, [activeWorkspacesQuery.data?.items, archivedWorkspacesQuery.data?.items]);

  const workspaceLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [workspaceId, meta] of workspaceMetaById.entries()) {
      map[workspaceId] = meta.name || meta.slug || workspaceId;
    }
    return map;
  }, [workspaceMetaById]);

  const resolveWorkspaces = useCallback(
    (workspaces: OrganizationMemberWorkspace[]): ResolvedMemberWorkspace[] => {
      return workspaces.map((workspace) => {
        const meta = workspaceMetaById.get(workspace.workspaceId);
        return {
          ...workspace,
          workspaceName: meta?.name || workspace.workspaceName,
          workspaceSlug: meta?.slug || workspace.workspaceSlug,
          description: meta?.description,
          iconUrl: meta?.iconUrl,
        };
      });
    },
    [workspaceMetaById],
  );

  const roleDetailsByCode = useMemo(() => {
    const map = new Map<string, { name: string; description: string | null }>();
    for (const role of rolesQuery.data?.items ?? []) {
      map.set(role.code, {
        name: getOrganizationRoleDisplayName(t, role.code, role.name),
        description: role.description,
      });
    }
    map.set("owner", {
      name: getOrganizationRoleDisplayName(t, "owner", map.get("owner")?.name),
      description: map.get("owner")?.description || t("common:ORG_ROLE_OWNER_DESC"),
    });
    map.set("admin", {
      name: getOrganizationRoleDisplayName(t, "admin", map.get("admin")?.name),
      description: map.get("admin")?.description || t("common:ORG_ROLE_ADMIN_DESC"),
    });
    map.set("member", {
      name: getOrganizationRoleDisplayName(t, "member", map.get("member")?.name),
      description: map.get("member")?.description || t("common:ORG_ROLE_MEMBER_DESC"),
    });
    return map;
  }, [rolesQuery.data?.items, t]);

  const roleNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const [code, role] of roleDetailsByCode.entries()) {
      map.set(code, role.name);
    }
    return map;
  }, [roleDetailsByCode]);

  const displayPermissions = useMemo<DisplayOrganizationPermission[]>(
    () =>
      (matrixQuery.data?.permissions ?? []).map((permission) => {
        const mapped = ORG_PERMISSION_COPY_MAP[permission.code];
        const displayName = mapped
          ? t(`common:${mapped.nameKey}`, { defaultValue: permission.name })
          : permission.name;
        const translatedDescription = mapped
          ? t(`common:${mapped.descKey}`, { defaultValue: permission.description || "" })
          : permission.description;
        const displayDescription = String(translatedDescription || permission.description || "").trim() || null;
        return {
          ...permission,
          displayName,
          displayDescription,
        };
      }),
    [matrixQuery.data?.permissions, t],
  );

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

  const openRoleDialog = useCallback((member: OrganizationMember) => {
    setEditingRoleMember(member);
    setRoleDraft(member.roleCode || member.role);
  }, []);

  const openRemoveDialog = useCallback((member: OrganizationMember) => {
    setPendingRemove(member);
  }, []);

  const handleEnterWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      void navigate({ to: `/w/${workspaceId}` });
    },
    [navigate, setCurrentWorkspaceId],
  );

  const columns = useMemo<Array<ColumnDef<OrganizationMember, unknown>>>(
    () => [
      {
        id: "member",
        header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        cell: ({ row }) => {
          const item = row.original;
          const primary = item.displayName || item.username;
          const secondary = item.email || "-";
          const isCurrentUser = currentUserId !== null && item.userId === currentUserId;
          const isOwnerSelf = item.role === "owner" && currentUserId !== null && item.userId === currentUserId;

          const leaveMenuLabel = isOwnerSelf ? (
            <Tooltip title={t("common:ORG_MEMBERS_OWNER_SELF_REMOVE_BLOCKED")}>
              <span>{t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")}</span>
            </Tooltip>
          ) : (
            t("common:ORG_MEMBERS_ACTION_LEAVE_ORGANIZATION")
          );

          const menuItems: MenuProps["items"] = [
            {
              key: "inspect",
              icon: <Eye className="size-4" />,
              label: t("common:ORG_MEMBERS_ACTION_INSPECT_USER"),
              onClick: () => {
                setInspectingMember(item);
              },
            },
            {
              key: "change_role",
              icon: <UserCog className="size-4" />,
              label: t("common:ORG_MEMBERS_ACTION_CHANGE_ROLE"),
              onClick: () => {
                openRoleDialog(item);
              },
            },
            { type: "divider" },
          ];

          if (isCurrentUser) {
            menuItems.push({
              key: "leave",
              icon: <Trash2 className="size-4" />,
              label: leaveMenuLabel,
              danger: true,
              disabled: isOwnerSelf,
              onClick: () => {
                if (isOwnerSelf) return;
                openRemoveDialog(item);
              },
            });
          } else {
            menuItems.push({
              key: "remove",
              icon: <Trash2 className="size-4" />,
              label: t("common:DELETE"),
              danger: true,
              onClick: () => {
                openRemoveDialog(item);
              },
            });
          }

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
                  <AntButton
                    type="text"
                    className="!h-8 !w-8 !p-0"
                    icon={<MoreVertical className="size-4" />}
                    aria-label={t("team:TEAM_USER_ACTIONS")}
                  />
                </Dropdown>
              </div>
            </div>
          );
        },
      },
      {
        id: "workspaces",
        header: t("common:ORG_MEMBERS_TABLE_WORKSPACES"),
        cell: ({ row }) => (
          <WorkspaceAssociationPopover
            workspaces={resolveWorkspaces(row.original.workspaces)}
            roleNameByCode={roleNameByCode}
            onEnterWorkspace={handleEnterWorkspace}
          />
        ),
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
        id: "lastLogin",
        header: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.lastLoginAt)}</span>
        ),
      },
    ],
    [
      currentUserId,
      handleEnterWorkspace,
      openRemoveDialog,
      openRoleDialog,
      resolveWorkspaces,
      roleNameByCode,
      t,
    ],
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
  const pendingRemoveIsCurrentUser =
    currentUserId !== null && pendingRemove !== null && pendingRemove.userId === currentUserId;

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

      <OrganizationMemberInspectSheet
        open={Boolean(inspectingMember)}
        onOpenChange={(open) => {
          if (!open) setInspectingMember(null);
        }}
        member={inspectingMember}
        currentUserId={currentUserId}
        roleDetailsByCode={roleDetailsByCode}
        rolesLoading={rolesQuery.isLoading}
        rolesError={rolesQuery.error}
        workspaceDataLoading={activeWorkspacesQuery.isLoading || archivedWorkspacesQuery.isLoading}
        workspaceDataError={activeWorkspacesQuery.error || archivedWorkspacesQuery.error}
        resolveWorkspaces={resolveWorkspaces}
        workspaceLabelById={workspaceLabelById}
        permissions={displayPermissions}
        permissionsLoading={matrixQuery.isLoading}
        permissionsError={matrixQuery.error}
        onEnterWorkspace={handleEnterWorkspace}
        onAdjustRole={(member) => {
          setInspectingMember(null);
          openRoleDialog(member);
        }}
        onRemoveMember={(member) => {
          setInspectingMember(null);
          openRemoveDialog(member);
        }}
      />

      <Dialog
        open={Boolean(editingRoleMember)}
        onOpenChange={(open) => {
          if (!open) setEditingRoleMember(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <div ref={roleDialogPopupRef} className="space-y-4">
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
                getPopupContainer={() => roleDialogPopupRef.current ?? document.body}
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
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={
          pendingRemoveIsCurrentUser
            ? t("common:ORG_MEMBERS_LEAVE_CONFIRM_TITLE")
            : t("common:ORG_MEMBERS_REMOVE_CONFIRM_TITLE")
        }
        description={
          pendingRemoveIsCurrentUser
            ? t("common:ORG_MEMBERS_LEAVE_CONFIRM_DESC")
            : t("common:ORG_MEMBERS_REMOVE_CONFIRM_DESC", {
                name: pendingRemove?.displayName || pendingRemove?.username || "",
              })
        }
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
