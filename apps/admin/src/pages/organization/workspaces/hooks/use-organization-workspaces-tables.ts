import { type ColumnDef } from "@tanstack/react-table";

import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import type { OrganizationWorkspace } from "@/types/api";
import { useDataTable, type UseDataTableResult } from "@arclayer/ui/data-table";

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
  const activeTableId = `organization-workspaces-active:${tableScope}`;
  const archivedTableId = `organization-workspaces-archived:${tableScope}`;

  const activeTableHook = useDataTable<OrganizationWorkspace>({
    tableId: activeTableId,
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
    tableId: archivedTableId,
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
    activeTableId,
    archivedTableId,
    activeTableHook,
    archivedTableHook,
  } as const;
}
