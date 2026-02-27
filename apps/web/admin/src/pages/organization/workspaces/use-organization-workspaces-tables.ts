import { type ColumnDef } from "@tanstack/react-table";

import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import type { OrganizationWorkspace } from "@/types/api";
import { useDataTable, type UseDataTableResult } from "@/components/data-table";

interface UseOrganizationWorkspacesTablesOptions {
  organizationId?: string;
  columns: Array<ColumnDef<OrganizationWorkspace, unknown>>;
}

export type OrganizationWorkspaceTableHook = UseDataTableResult<
  OrganizationWorkspace,
  Record<string, unknown>
>;

export function useOrganizationWorkspacesTables(options: UseOrganizationWorkspacesTablesOptions) {
  const { organizationId, columns } = options;
  const tableScope = organizationId ? `org:${organizationId}` : "org:me";

  const activeTableHook = useDataTable<OrganizationWorkspace>({
    tableId: `organization-workspaces-active:${tableScope}`,
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationWorkspaces({
        organizationId,
        page: params.page,
        size: params.size,
        q: params.q,
        ordering: params.ordering,
        archived: false,
      }),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const archivedTableHook = useDataTable<OrganizationWorkspace>({
    tableId: `organization-workspaces-archived:${tableScope}`,
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationWorkspaces({
        organizationId,
        page: params.page,
        size: params.size,
        q: params.q,
        ordering: params.ordering,
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
