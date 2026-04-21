import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useDataTable } from "@arclayer/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";

import {
  deleteSystemDirectoryUser,
  disableSystemDirectoryUser,
  disableSystemDirectoryUserTwoFactor,
  enableSystemDirectoryUser,
  getSystemDirectoryOrganizationDetail,
  getSystemDirectoryProjectDetail,
  getSystemDirectoryUserDetail,
  getSystemDirectoryWorkspaceDetail,
  listSystemDirectoryOrganizations,
  listSystemDirectoryProjects,
  listSystemDirectoryUsers,
  listSystemDirectoryWorkspaces,
  resetSystemDirectoryUserPassword,
  revokeSystemDirectoryUserSessions,
  sendSystemDirectoryUserResetPasswordEmail,
  unlinkSystemDirectoryUserOAuthIdentity,
  updateSystemDirectoryUser,
} from "@/api/system-directory";
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
} from "@/types/api/system-directory";

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
) {
  const tableId = "system-directory-organizations";
  const tableHook = useDataTable<SystemDirectoryOrganization>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryOrganizations(params),
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
) {
  const tableId = "system-directory-workspaces";
  const tableHook = useDataTable<SystemDirectoryWorkspace>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryWorkspaces(params),
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
) {
  const tableId = "system-directory-projects";
  const tableHook = useDataTable<SystemDirectoryProject>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryProjects(params),
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
