import { type ColumnDef } from "@tanstack/react-table";

import { listProjects } from "@/api/projects";
import { useDataTable, type UseDataTableResult } from "@arclayer/ui/data-table";

import { mapProjectToListItem, type UserCenterProjectListItem } from "../project-list-items";

interface UseUserCenterProjectsTablesOptions {
  workspaceId?: string;
  columns: Array<ColumnDef<UserCenterProjectListItem, unknown>>;
}

export type UserCenterProjectTableHook = UseDataTableResult<
  UserCenterProjectListItem,
  Record<string, unknown>
>;

export function useUserCenterProjectsTables(options: UseUserCenterProjectsTablesOptions) {
  const { workspaceId, columns } = options;
  const tableScope = workspaceId ? `workspace:${workspaceId}` : "all";
  const activeTableId = `projects-active:${tableScope}`;
  const archivedTableId = `projects-archived:${tableScope}`;

  const activeTableHook = useDataTable<UserCenterProjectListItem>({
    tableId: activeTableId,
    columns,
    initialState: { pageSize: 10, sorting: [{ id: "createdAt", desc: true }] },
    fetcher: async (params) => {
      const result = await listProjects({
        workspaceId,
        page: params.page,
        size: params.size,
        q: params.q,
        archived: false,
      });
      return {
        ...result,
        items: result.items.map(mapProjectToListItem),
      };
    },
    queryOptions: {
      enabled: Boolean(workspaceId),
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const archivedTableHook = useDataTable<UserCenterProjectListItem>({
    tableId: archivedTableId,
    columns,
    initialState: { pageSize: 10, sorting: [{ id: "createdAt", desc: true }] },
    fetcher: async (params) => {
      const result = await listProjects({
        workspaceId,
        page: params.page,
        size: params.size,
        q: params.q,
        archived: true,
      });
      return {
        ...result,
        items: result.items.map(mapProjectToListItem),
      };
    },
    queryOptions: {
      enabled: Boolean(workspaceId),
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
