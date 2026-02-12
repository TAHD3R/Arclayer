import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import { getOrganizationRbacMatrix, listOrganizationRoles } from "@/api/organization-rbac";
import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import { useDataTable } from "@/components/data-table";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import {
  type InviteOrganizationMemberFormValues,
  type InviteOrganizationRoleOption,
} from "../shared/invite-organization-member-dialog";
import { type ResolvedMemberWorkspace } from "../shared/organization-member-workspace-list";
import { getOrganizationRoleDisplayName } from "../shared/role-i18n";
import { type OrgMemberFilters } from "./members-filter-popover";
import { type DisplayOrganizationPermission, mapDisplayPermissions } from "./members-display";
import { createOrganizationMemberColumns } from "./members-table-columns";

type OrganizationWorkspaceMeta = {
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
};

type OrganizationMembersTableQuery = {
  role?: OrgRole;
  membershipStatus?: OrgMembershipStatus;
  userStatus?: OrgUserStatus;
  hasWorkspace?: boolean;
};

export function useOrganizationTeamMembers() {
  const { t } = useTranslation(["nav", "common", "team"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [filters, setFilters] = useState<OrgMemberFilters>({});
  const [pendingRemove, setPendingRemove] = useState<OrganizationMember | null>(null);
  const [editingRoleMember, setEditingRoleMember] = useState<OrganizationMember | null>(null);
  const [inspectingMember, setInspectingMember] = useState<OrganizationMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>("member");
  const dateTime = useWorkspaceDateTimeFormatter();

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

  const currentUserId = meQuery.data?.id ? String(meQuery.data.id) : null;

  const workspaceMetaById = useMemo(() => {
    const map = new Map<string, OrganizationWorkspaceMeta>();

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
    () => mapDisplayPermissions(t, matrixQuery.data?.permissions ?? []),
    [matrixQuery.data?.permissions, t],
  );

  const roleOptions = useMemo<InviteOrganizationRoleOption[]>(() => {
    const fromApi = (rolesQuery.data?.items ?? []).map((role) => ({
      value: role.code,
      label: getOrganizationRoleDisplayName(t, role.code, role.name),
    }));

    if (fromApi.length > 0) {
      return fromApi;
    }

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
    mutationFn: async (payload: InviteOrganizationMemberFormValues) => {
      const results = await Promise.allSettled(
        payload.emails.map((email) =>
          inviteOrganizationMember({
            email,
            roleCode: payload.roleCode,
            expiresInSeconds: payload.expiresInSeconds ?? undefined,
          }),
        ),
      );

      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const failedCount = failed.length;

      if (successCount === 0 && failedCount > 0) {
        throw failed[0]?.reason;
      }

      return { successCount, failedCount };
    },
    onSuccess: async (result) => {
      if (result.failedCount > 0) {
        notifySuccessText(
          t("team:TEAM_INVITE_SUCCESS_WITH_FAILURE", {
            count: result.successCount,
            failed: result.failedCount,
          }),
        );
      } else {
        notifySuccessText(t("team:TEAM_INVITE_SUCCESS", { count: result.successCount }));
      }

      setInviteOpen(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-team-members"] }),
        queryClient.invalidateQueries({
          queryKey: ["dataTable", "organization-invitations:pending"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dataTable", "organization-invitations:processed"],
        }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (payload: { membershipId: string; roleCode: string }) =>
      patchOrganizationMemberRole(payload.membershipId, { roleCode: payload.roleCode }),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setEditingRoleMember(null);
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-team-members"] });
    },
    onError: (error) => notifyError(error),
  });

  const removeMutation = useMutation({
    mutationFn: async (membershipId: string) => deleteOrganizationMember(membershipId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setPendingRemove(null);
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-team-members"] });
    },
    onError: (error) => notifyError(error),
  });

  const openInviteDialog = useCallback(() => {
    setInviteOpen(true);
  }, []);

  const openRoleDialog = useCallback((member: OrganizationMember) => {
    setEditingRoleMember(member);
    setRoleDraft(member.roleCode || member.role);
  }, []);

  const openRemoveDialog = useCallback((member: OrganizationMember) => {
    setPendingRemove(member);
  }, []);

  const openInspectSheet = useCallback((member: OrganizationMember) => {
    setInspectingMember(member);
  }, []);

  const handleRoleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingRoleMember(null);
    }
  }, []);

  const handlePendingRemoveOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingRemove(null);
    }
  }, []);

  const handleEnterWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      void navigate({ to: `/w/${workspaceId}` });
    },
    [navigate, setCurrentWorkspaceId],
  );

  const columns = useMemo(
    () =>
      createOrganizationMemberColumns({
        t,
        currentUserId,
        formatDateTime: dateTime.formatDateTime,
        roleNameByCode,
        resolveWorkspaces,
        onInspectMember: openInspectSheet,
        onOpenRoleDialog: openRoleDialog,
        onOpenRemoveDialog: openRemoveDialog,
        onEnterWorkspace: handleEnterWorkspace,
      }),
    [
      t,
      currentUserId,
      dateTime.formatDateTime,
      roleNameByCode,
      resolveWorkspaces,
      openInspectSheet,
      openRoleDialog,
      openRemoveDialog,
      handleEnterWorkspace,
    ],
  );

  const tableHook = useDataTable<OrganizationMember, OrganizationMembersTableQuery>({
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
        ordering: params.ordering,
        role: params.role,
        membershipStatus: params.membershipStatus,
        userStatus: params.userStatus,
        hasWorkspace: params.hasWorkspace,
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

  const handlePaginationChange = useCallback(
    (nextPage: number, nextSize: number) => {
      if (nextSize !== table.getState().pagination.pageSize) {
        table.setPageSize(nextSize);
      }
      table.setPageIndex(Math.max(0, nextPage - 1));
    },
    [table],
  );

  const handleInviteSubmit = useCallback(
    async (values: InviteOrganizationMemberFormValues) => {
      await inviteMutation.mutateAsync(values);
    },
    [inviteMutation],
  );

  const handleConfirmRoleChange = useCallback(
    async (member: OrganizationMember, roleCode: string) => {
      await updateRoleMutation.mutateAsync({
        membershipId: member.membershipId,
        roleCode,
      });
    },
    [updateRoleMutation],
  );

  const handleConfirmRemove = useCallback(
    async (member: OrganizationMember) => {
      await removeMutation.mutateAsync(member.membershipId);
    },
    [removeMutation],
  );

  return {
    t,
    openInviteDialog,
    toolbarProps: {
      searchInput: tableHook.searchInput,
      onSearchInputChange: tableHook.setSearchInput,
      filters,
      onFiltersChange: setFilters,
      isFetching: tableHook.isFetching,
      isLoading: tableHook.isLoading,
    },
    tableState: {
      table,
      pageData,
      isLoading: tableHook.isLoading,
      isFetching: tableHook.isFetching,
      error: tableHook.error,
      refetch: tableHook.refetch,
      empty,
      onPaginationChange: handlePaginationChange,
    },
    dialogsProps: {
      inviteOpen,
      onInviteOpenChange: setInviteOpen,
      inviteLoading: inviteMutation.isPending,
      roleOptions,
      defaultRoleCode,
      onInviteSubmit: handleInviteSubmit,
      inspectingMember,
      onInspectingMemberChange: setInspectingMember,
      currentUserId,
      roleDetailsByCode,
      rolesLoading: rolesQuery.isLoading,
      rolesError: rolesQuery.error,
      workspaceDataLoading: activeWorkspacesQuery.isLoading || archivedWorkspacesQuery.isLoading,
      workspaceDataError: activeWorkspacesQuery.error || archivedWorkspacesQuery.error,
      resolveWorkspaces,
      workspaceLabelById,
      permissions: displayPermissions,
      permissionsLoading: matrixQuery.isLoading,
      permissionsError: matrixQuery.error,
      onEnterWorkspace: handleEnterWorkspace,
      onAdjustRoleFromInspect: openRoleDialog,
      onRemoveMemberFromInspect: openRemoveDialog,
      editingRoleMember,
      onRoleDialogOpenChange: handleRoleDialogOpenChange,
      roleDraft,
      onRoleDraftChange: setRoleDraft,
      roleUpdateLoading: updateRoleMutation.isPending,
      onConfirmRoleChange: handleConfirmRoleChange,
      pendingRemove,
      pendingRemoveIsCurrentUser,
      removeLoading: removeMutation.isPending,
      onPendingRemoveOpenChange: handlePendingRemoveOpenChange,
      onConfirmRemove: handleConfirmRemove,
    },
  };
}
