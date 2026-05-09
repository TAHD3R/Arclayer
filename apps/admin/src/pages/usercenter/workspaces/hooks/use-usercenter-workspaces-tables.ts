import { type ColumnDef } from "@tanstack/react-table";

import { listAllWorkspaces } from "@/api/workspace-management";
import { useDataTable, type UseDataTableResult } from "@arclayer/ui/data-table";

import {
  mapWorkspaceManageListItemToListItem,
  paginateWorkspaceList,
  type UserCenterWorkspaceListItem,
} from "../workspace-list-items";

interface UseUserCenterWorkspacesTablesOptions {
  columns: Array<ColumnDef<UserCenterWorkspaceListItem, unknown>>;
}

export type UserCenterWorkspaceTableHook = UseDataTableResult<
  UserCenterWorkspaceListItem,
  Record<string, unknown>
>;

export function useUserCenterWorkspacesTables(options: UseUserCenterWorkspacesTablesOptions) {
  const { columns } = options;
  const activeTableId = "workspace-management-active";
  const archivedTableId = "workspace-management-archived";

  const activeTableHook = useDataTable<UserCenterWorkspaceListItem>({
    tableId: activeTableId,
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) => {
      const workspaceItems = await listAllWorkspaces({
        q: params.q,
        ordering: params.ordering,
        archived: false,
      });
      const teamItems = workspaceItems.map(mapWorkspaceManageListItemToListItem);

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
      const workspaceItems = await listAllWorkspaces({
        q: params.q,
        ordering: params.ordering,
        archived: true,
      });

      return paginateWorkspaceList(
        workspaceItems.map(mapWorkspaceManageListItemToListItem),
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
