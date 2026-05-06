import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useDataTable } from "@arclayer/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";

import {
  archiveSystemDirectoryWorkspace,
  deleteSystemDirectoryOrganization,
  deleteSystemDirectoryWorkspace,
  deleteSystemDirectoryUser,
  deleteSystemDirectoryProject,
  disableSystemDirectoryOrganization,
  disableSystemDirectoryProject,
  disableSystemDirectoryUser,
  disableSystemDirectoryUserTwoFactor,
  disableSystemDirectoryWorkspace,
  enableSystemDirectoryOrganization,
  enableSystemDirectoryProject,
  enableSystemDirectoryUser,
  enableSystemDirectoryWorkspace,
  getSystemDirectoryOrganizationDetail,
  getSystemDirectoryProjectDetail,
  getSystemDirectoryUserDetail,
  getSystemDirectoryWorkspaceDetail,
  listSystemDirectoryOrganizations,
  listSystemDirectoryProjects,
  listSystemDirectoryUsers,
  listSystemDirectoryWorkspaces,
  resetSystemDirectoryUserPassword,
  restoreSystemDirectoryWorkspace,
  revokeSystemDirectoryUserSessions,
  sendSystemDirectoryUserResetPasswordEmail,
  unlinkSystemDirectoryUserOAuthIdentity,
  updateSystemDirectoryOrganization,
  updateSystemDirectoryProject,
  updateSystemDirectoryUser,
  updateSystemDirectoryWorkspace,
} from "@/api/system-directory";
import { listWorkspaceRoles } from "@/api/rbac";
import {
  assignWorkspaceRoleToAllUsers,
  getWorkspaceRolePolicy,
  patchWorkspaceRolePolicy,
} from "@/api/workspaces";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type {
  SystemDirectoryOrganizationDetail,
  SystemDirectoryOrganization,
  SystemDirectoryProjectDetail,
  SystemDirectoryProject,
  SystemDirectoryUserDetail,
  SystemDirectoryUser,
  SystemDirectoryWorkspaceDetail,
  SystemDirectoryWorkspace,
} from "@arclayer/openapi/admin-types";

const QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  retry: false,
  meta: { silent: true },
} as const;

const DETAIL_QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  retry: false,
  meta: { silent: true },
} as const;

export function buildSystemDirectoryUserDetailQueryKey(userId: string | null) {
  return ["system-directory", "users", userId] as const;
}

function invalidateSystemDirectoryUsers(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dataTable", "system-directory-users"] }),
    queryClient.invalidateQueries({ queryKey: ["system-directory", "users"] }),
  ]);
}

function invalidateSystemDirectoryOrganizations(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dataTable", "system-directory-organizations"] }),
    queryClient.invalidateQueries({ queryKey: ["system-directory", "organizations"] }),
  ]);
}

function invalidateSystemDirectoryWorkspaces(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dataTable", "system-directory-workspaces"] }),
    queryClient.invalidateQueries({ queryKey: ["system-directory", "workspaces"] }),
  ]);
}

function invalidateSystemDirectoryProjects(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dataTable", "system-directory-projects"] }),
    queryClient.invalidateQueries({ queryKey: ["system-directory", "projects"] }),
  ]);
}

export function useSystemDirectoryUsersTable(
  columns: Array<ColumnDef<SystemDirectoryUser, unknown>>,
  extraQuery?: {
    status?: string;
    isSuperAdmin?: boolean;
    hasPassword?: boolean;
    twoFactorEnabled?: boolean;
    oauthProvider?: string;
  },
) {
  const tableId = "system-directory-users";
  const tableHook = useDataTable<SystemDirectoryUser>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryUsers(params),
    extraQuery,
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.userId,
    },
    queryOptions: QUERY_OPTIONS,
  });

  return { tableId, ...tableHook } as const;
}

export function useSystemDirectoryOrganizationsTable(
  columns: Array<ColumnDef<SystemDirectoryOrganization, unknown>>,
  extraQuery?: {
    kind?: string;
    isActive?: boolean;
  },
) {
  const tableId = "system-directory-organizations";
  const tableHook = useDataTable<SystemDirectoryOrganization>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryOrganizations(params),
    extraQuery,
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.organizationId,
    },
    queryOptions: QUERY_OPTIONS,
  });

  return { tableId, ...tableHook } as const;
}

export function useSystemDirectoryWorkspacesTable(
  columns: Array<ColumnDef<SystemDirectoryWorkspace, unknown>>,
  extraQuery?: {
    organizationId?: string;
    isArchived?: boolean;
    isActive?: boolean;
  },
) {
  const tableId = "system-directory-workspaces";
  const tableHook = useDataTable<SystemDirectoryWorkspace>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryWorkspaces(params),
    extraQuery,
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.workspaceId,
    },
    queryOptions: QUERY_OPTIONS,
  });

  return { tableId, ...tableHook } as const;
}

export function useSystemDirectoryProjectsTable(
  columns: Array<ColumnDef<SystemDirectoryProject, unknown>>,
  extraQuery?: {
    organizationId?: string;
    workspaceId?: string;
    isActive?: boolean;
  },
) {
  const tableId = "system-directory-projects";
  const tableHook = useDataTable<SystemDirectoryProject>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryProjects(params),
    extraQuery,
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.projectId,
    },
    queryOptions: QUERY_OPTIONS,
  });

  return { tableId, ...tableHook } as const;
}

export function useSystemDirectoryUserDetail(userId: string | null) {
  const query = useQuery({
    queryKey: buildSystemDirectoryUserDetailQueryKey(userId),
    queryFn: async () => {
      if (!userId) throw new Error("USER_ID_REQUIRED");
      return getSystemDirectoryUserDetail(userId);
    },
    enabled: Boolean(userId),
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    ...query,
    detail: (query.data ?? null) as SystemDirectoryUserDetail | null,
  } as const;
}

export function useSystemDirectoryUserOptions() {
  const query = useQuery({
    queryKey: ["system-directory", "users", "options"],
    queryFn: async () => listSystemDirectoryUsers({ page: 1, size: 200, ordering: "username" }),
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    ...query,
    users: query.data?.items ?? [],
  } as const;
}

export function useSystemDirectoryUserGovernance() {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();

  const editProfileMutation = useMutation({
    mutationFn: async (params: {
      userId: string;
      email?: string | null;
      displayName?: string | null;
      avatarAssetId?: string | null;
    }) => {
      return updateSystemDirectoryUser(params.userId, {
        email: params.email,
        displayName: params.displayName,
        avatarAssetId: params.avatarAssetId,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (params: { userId: string; newPassword: string }) => {
      return resetSystemDirectoryUserPassword(params.userId, {
        newPassword: params.newPassword,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESET_PASSWORD_SUCCESS"));
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async (params: { userIds: string[] }) => {
      return Promise.all(params.userIds.map((userId) => revokeSystemDirectoryUserSessions(userId)));
    },
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.userIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const sendResetPasswordEmailMutation = useMutation({
    mutationFn: async (params: { userId: string }) =>
      sendSystemDirectoryUserResetPasswordEmail(params.userId),
    onSuccess: async () => {
      notifySuccessText(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_SEND_RESET_PASSWORD_EMAIL_SUCCESS"),
      );
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const disableTwoFactorMutation = useMutation({
    mutationFn: async (params: { userId: string }) =>
      disableSystemDirectoryUserTwoFactor(params.userId),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_TWO_FACTOR_SUCCESS"));
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const unlinkOAuthIdentityMutation = useMutation({
    mutationFn: async (params: { userId: string; provider: string }) =>
      unlinkSystemDirectoryUserOAuthIdentity(params.userId, params.provider),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_UNLINK_OAUTH_SUCCESS"));
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const disableUsersMutation = useMutation({
    mutationFn: async (params: { userIds: string[] }) => {
      return Promise.all(params.userIds.map((userId) => disableSystemDirectoryUser(userId)));
    },
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.userIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const enableUsersMutation = useMutation({
    mutationFn: async (params: { userIds: string[] }) => {
      return Promise.all(params.userIds.map((userId) => enableSystemDirectoryUser(userId)));
    },
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.userIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ACCOUNT_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ACCOUNT_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (params: { userId: string }) => deleteSystemDirectoryUser(params.userId),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ACCOUNT_SUCCESS"));
      await invalidateSystemDirectoryUsers(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  return {
    editProfileMutation,
    resetPasswordMutation,
    revokeSessionsMutation,
    sendResetPasswordEmailMutation,
    disableTwoFactorMutation,
    unlinkOAuthIdentityMutation,
    disableUsersMutation,
    enableUsersMutation,
    deleteUserMutation,
  } as const;
}

export function useSystemDirectoryOrganizationDetail(organizationId: string | null) {
  const query = useQuery({
    queryKey: ["system-directory", "organizations", organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
      return getSystemDirectoryOrganizationDetail(organizationId);
    },
    enabled: Boolean(organizationId),
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    ...query,
    detail: (query.data ?? null) as SystemDirectoryOrganizationDetail | null,
  } as const;
}

export function useSystemDirectoryOrganizationOptions() {
  const query = useQuery({
    queryKey: ["system-directory", "organizations", "options"],
    queryFn: async () => listSystemDirectoryOrganizations({ page: 1, size: 200, ordering: "name" }),
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    ...query,
    organizations: query.data?.items ?? [],
  } as const;
}

export function useSystemDirectoryWorkspaceOptions(extraQuery?: { organizationId?: string }) {
  const query = useQuery({
    queryKey: ["system-directory", "workspaces", "options", extraQuery?.organizationId ?? "all"],
    queryFn: async () =>
      listSystemDirectoryWorkspaces({
        page: 1,
        size: 200,
        ordering: "name",
        organizationId: extraQuery?.organizationId,
      }),
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    ...query,
    workspaces: query.data?.items ?? [],
  } as const;
}

export function useSystemDirectoryWorkspaceRoleOptions(workspaceId: string | null) {
  const rolesQuery = useQuery({
    queryKey: ["workspace", "rbac", "roles", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_ID_REQUIRED");
      return listWorkspaceRoles(workspaceId, { page: 1, size: 200 });
    },
    ...DETAIL_QUERY_OPTIONS,
  });

  const rolePolicyQuery = useQuery({
    queryKey: ["workspace", "role-policy", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_ID_REQUIRED");
      return getWorkspaceRolePolicy(workspaceId);
    },
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    rolesQuery,
    rolePolicyQuery,
    roles: rolesQuery.data?.items ?? [],
    defaultRoleCode:
      rolePolicyQuery.data?.defaultRoleCode ??
      rolesQuery.data?.items.find((role) => role.isDefault)?.code ??
      rolesQuery.data?.items[0]?.code ??
      "",
  } as const;
}

export function useSystemDirectoryWorkspaceDetail(workspaceId: string | null) {
  const query = useQuery({
    queryKey: ["system-directory", "workspaces", workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_ID_REQUIRED");
      return getSystemDirectoryWorkspaceDetail(workspaceId);
    },
    enabled: Boolean(workspaceId),
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    ...query,
    detail: (query.data ?? null) as SystemDirectoryWorkspaceDetail | null,
  } as const;
}

export function useSystemDirectoryProjectDetail(projectId: string | null) {
  const query = useQuery({
    queryKey: ["system-directory", "projects", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
      return getSystemDirectoryProjectDetail(projectId);
    },
    enabled: Boolean(projectId),
    ...DETAIL_QUERY_OPTIONS,
  });

  return {
    ...query,
    detail: (query.data ?? null) as SystemDirectoryProjectDetail | null,
  } as const;
}

export function useSystemDirectoryOrganizationGovernance() {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();

  const updateOrganizationMutation = useMutation({
    mutationFn: async (params: {
      organizationId: string;
      name?: string | null;
      slug?: string | null;
      ownerUserId?: string | null;
    }) =>
      updateSystemDirectoryOrganization(params.organizationId, {
        name: params.name,
        slug: params.slug,
        ownerUserId: params.ownerUserId,
      }),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await invalidateSystemDirectoryOrganizations(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const disableOrganizationsMutation = useMutation({
    mutationFn: async (params: { organizationIds: string[] }) =>
      Promise.all(params.organizationIds.map((id) => disableSystemDirectoryOrganization(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.organizationIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ORGANIZATION_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ORGANIZATION_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryOrganizations(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const enableOrganizationsMutation = useMutation({
    mutationFn: async (params: { organizationIds: string[] }) =>
      Promise.all(params.organizationIds.map((id) => enableSystemDirectoryOrganization(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.organizationIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ORGANIZATION_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ORGANIZATION_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryOrganizations(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const deleteOrganizationsMutation = useMutation({
    mutationFn: async (params: {
      organizations: Array<{ organizationId: string; confirmName: string }>;
    }) =>
      Promise.all(
        params.organizations.map((organization) =>
          deleteSystemDirectoryOrganization(organization.organizationId, {
            confirmName: organization.confirmName,
          }),
        ),
      ),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.organizations.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ORGANIZATION_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ORGANIZATION_SUCCESS"),
      );
      await invalidateSystemDirectoryOrganizations(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  return {
    updateOrganizationMutation,
    disableOrganizationsMutation,
    enableOrganizationsMutation,
    deleteOrganizationsMutation,
  } as const;
}

export function useSystemDirectoryWorkspaceGovernance() {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();

  const updateWorkspaceMutation = useMutation({
    mutationFn: async (params: {
      workspaceId: string;
      name?: string | null;
      description?: string | null;
      iconMode?: "initials" | "glyph" | "emoji" | "image" | null;
      iconColor?: string | null;
      iconGlyph?: string | null;
      iconEmoji?: string | null;
      iconUrl?: string | null;
    }) =>
      updateSystemDirectoryWorkspace(params.workspaceId, {
        name: params.name,
        description: params.description,
        iconMode: params.iconMode,
        iconColor: params.iconColor,
        iconGlyph: params.iconGlyph,
        iconEmoji: params.iconEmoji,
        iconUrl: params.iconUrl,
      }),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await invalidateSystemDirectoryWorkspaces(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const archiveWorkspacesMutation = useMutation({
    mutationFn: async (params: { workspaceIds: string[] }) =>
      Promise.all(params.workspaceIds.map((id) => archiveSystemDirectoryWorkspace(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.workspaceIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_WORKSPACE_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryWorkspaces(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const restoreWorkspacesMutation = useMutation({
    mutationFn: async (params: { workspaceIds: string[] }) =>
      Promise.all(params.workspaceIds.map((id) => restoreSystemDirectoryWorkspace(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.workspaceIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESTORE_WORKSPACE_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryWorkspaces(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const disableWorkspacesMutation = useMutation({
    mutationFn: async (params: { workspaceIds: string[] }) =>
      Promise.all(params.workspaceIds.map((id) => disableSystemDirectoryWorkspace(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.workspaceIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_WORKSPACE_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryWorkspaces(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const enableWorkspacesMutation = useMutation({
    mutationFn: async (params: { workspaceIds: string[] }) =>
      Promise.all(params.workspaceIds.map((id) => enableSystemDirectoryWorkspace(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.workspaceIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_WORKSPACE_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryWorkspaces(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const deleteWorkspacesMutation = useMutation({
    mutationFn: async (params: { workspaceId: string; confirmName: string }) =>
      deleteSystemDirectoryWorkspace(params.workspaceId, {
        confirmName: params.confirmName,
      }),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_WORKSPACE_SUCCESS"));
      await invalidateSystemDirectoryWorkspaces(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const updateWorkspaceDefaultRoleMutation = useMutation({
    mutationFn: async (params: { workspaceId: string; defaultRoleCode: string }) =>
      patchWorkspaceRolePolicy(params.workspaceId, { defaultRoleCode: params.defaultRoleCode }),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_UPDATE_WORKSPACE_ROLE_SUCCESS"),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workspace", "role-policy", variables.workspaceId],
        }),
        invalidateSystemDirectoryWorkspaces(queryClient),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  const assignWorkspaceRoleMutation = useMutation({
    mutationFn: async (params: { workspaceId: string; roleCode: string; confirmName: string }) =>
      assignWorkspaceRoleToAllUsers(params.workspaceId, {
        roleCode: params.roleCode,
        confirmName: params.confirmName,
      }),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ASSIGN_WORKSPACE_ROLE_SUCCESS"),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workspace", "rbac", "roles", variables.workspaceId],
        }),
        invalidateSystemDirectoryWorkspaces(queryClient),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  return {
    updateWorkspaceMutation,
    archiveWorkspacesMutation,
    restoreWorkspacesMutation,
    disableWorkspacesMutation,
    enableWorkspacesMutation,
    deleteWorkspacesMutation,
    updateWorkspaceDefaultRoleMutation,
    assignWorkspaceRoleMutation,
  } as const;
}

export function useSystemDirectoryProjectGovernance() {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();

  const updateProjectMutation = useMutation({
    mutationFn: async (params: {
      projectId: string;
      name?: string | null;
      slug?: string | null;
      description?: string | null;
      iconMode?: "initials" | "glyph" | "emoji" | "image" | null;
      iconColor?: string | null;
      iconGlyph?: string | null;
      iconEmoji?: string | null;
      iconUrl?: string | null;
    }) =>
      updateSystemDirectoryProject(params.projectId, {
        name: params.name,
        slug: params.slug,
        description: params.description,
        iconMode: params.iconMode,
        iconColor: params.iconColor,
        iconGlyph: params.iconGlyph,
        iconEmoji: params.iconEmoji,
        iconUrl: params.iconUrl,
      }),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await invalidateSystemDirectoryProjects(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const disableProjectsMutation = useMutation({
    mutationFn: async (params: { projectIds: string[] }) =>
      Promise.all(params.projectIds.map((id) => disableSystemDirectoryProject(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.projectIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryProjects(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const enableProjectsMutation = useMutation({
    mutationFn: async (params: { projectIds: string[] }) =>
      Promise.all(params.projectIds.map((id) => enableSystemDirectoryProject(id))),
    onSuccess: async (_data, variables) => {
      notifySuccessText(
        variables.projectIds.length > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT_SUCCESS_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT_SUCCESS_ONE"),
      );
      await invalidateSystemDirectoryProjects(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (params: { projectId: string; confirmName: string }) =>
      deleteSystemDirectoryProject(params.projectId, {
        confirmName: params.confirmName,
      }),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT_SUCCESS"));
      await invalidateSystemDirectoryProjects(queryClient);
    },
    onError: (error) => notifyError(error),
  });

  return {
    updateProjectMutation,
    disableProjectsMutation,
    enableProjectsMutation,
    deleteProjectMutation,
  } as const;
}
