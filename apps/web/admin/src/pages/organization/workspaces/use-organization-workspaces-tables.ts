import { type ColumnDef } from "@tanstack/react-table";

import {
  listOrganizationWorkspaces,
  type OrganizationWorkspace,
} from "@/api/organization-workspaces";
import { useDataTable, type UseDataTableResult } from "@/components/data-table";

interface UseOrganizationWorkspacesTablesOptions {
  columns: Array<ColumnDef<OrganizationWorkspace, unknown>>;
}

export type OrganizationWorkspaceTableHook = UseDataTableResult<
  OrganizationWorkspace,
  Record<string, unknown>
>;

export function useOrganizationWorkspacesTables(options: UseOrganizationWorkspacesTablesOptions) {
  const { columns } = options;

  const activeTableHook = useDataTable<OrganizationWorkspace>({
    tableId: "organization-workspaces-active",
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationWorkspaces({
        page: params.page,
        size: params.size,
        q: params.q,
        archived: false,
      }),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const archivedTableHook = useDataTable<OrganizationWorkspace>({
    tableId: "organization-workspaces-archived",
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationWorkspaces({
        page: params.page,
        size: params.size,
        q: params.q,
        archived: true,
      }),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  return {
    activeTableHook,
    archivedTableHook,
  } as const;
}
