import { useQuery } from "@tanstack/react-query";
import { useDataTable } from "@arclayer/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";

import {
  getSystemDirectoryOrganizationDetail,
  getSystemDirectoryProjectDetail,
  getSystemDirectoryUserDetail,
  getSystemDirectoryWorkspaceDetail,
  listSystemDirectoryOrganizations,
  listSystemDirectoryProjects,
  listSystemDirectoryUsers,
  listSystemDirectoryWorkspaces,
} from "@/api/system-directory";
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

export function useSystemDirectoryUsersTable(
  columns: Array<ColumnDef<SystemDirectoryUser, unknown>>,
) {
  const tableId = "system-directory-users";
  const tableHook = useDataTable<SystemDirectoryUser>({
    tableId,
    columns,
    initialState: { pageSize: 20 },
    fetcher: async (params) => listSystemDirectoryUsers(params),
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
    queryOptions: QUERY_OPTIONS,
  });

  return { tableId, ...tableHook } as const;
}

export function useSystemDirectoryUserDetail(userId: string | null) {
  const query = useQuery({
    queryKey: ["system-directory", "users", userId],
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
