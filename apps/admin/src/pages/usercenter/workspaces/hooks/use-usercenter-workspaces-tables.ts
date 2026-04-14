import { type ColumnDef } from "@tanstack/react-table";

import { listAllOrganizationWorkspaces } from "@/api/organization-workspaces";
import { useDataTable, type UseDataTableResult } from "@arclayer/ui/data-table";

import {
  mapOrganizationWorkspaceToListItem,
  paginateWorkspaceList,
  type UserCenterWorkspaceListItem,
} from "../workspace-list-items";

interface UseUserCenterWorkspacesTablesOptions {
  organizationId?: string;
  columns: Array<ColumnDef<UserCenterWorkspaceListItem, unknown>>;
}

export type UserCenterWorkspaceTableHook = UseDataTableResult<
  UserCenterWorkspaceListItem,
  Record<string, unknown>
>;

export function useUserCenterWorkspacesTables(options: UseUserCenterWorkspacesTablesOptions) {
  const { organizationId, columns } = options;
  const tableScope = organizationId ? `org:${organizationId}` : "org:me";
  const activeTableId = `organization-workspaces-active:${tableScope}`;
  const archivedTableId = `organization-workspaces-archived:${tableScope}`;

  const activeTableHook = useDataTable<UserCenterWorkspaceListItem>({
    tableId: activeTableId,
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) => {
      const organizationItems = await listAllOrganizationWorkspaces({
        organizationId,
        q: params.q,
        ordering: params.ordering,
        archived: false,
      });
      const teamItems = organizationItems.map(mapOrganizationWorkspaceToListItem);

      return paginateWorkspaceList(teamItems, params.page, params.size);
    },
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const archivedTableHook = useDataTable<UserCenterWorkspaceListItem>({
    tableId: archivedTableId,
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) => {
      const organizationItems = await listAllOrganizationWorkspaces({
        organizationId,
        q: params.q,
        ordering: params.ordering,
        archived: true,
      });

      return paginateWorkspaceList(
        organizationItems.map(mapOrganizationWorkspaceToListItem),
        params.page,
        params.size,
      );
    },
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
