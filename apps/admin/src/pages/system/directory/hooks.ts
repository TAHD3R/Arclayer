import { useDataTable } from "@arclayer/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";

import {
  listSystemDirectoryOrganizations,
  listSystemDirectoryProjects,
  listSystemDirectoryUsers,
  listSystemDirectoryWorkspaces,
} from "@/api/system-directory";
import type {
  SystemDirectoryOrganization,
  SystemDirectoryProject,
  SystemDirectoryUser,
  SystemDirectoryWorkspace,
} from "@/types/api/system-directory";

const QUERY_OPTIONS = {
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
