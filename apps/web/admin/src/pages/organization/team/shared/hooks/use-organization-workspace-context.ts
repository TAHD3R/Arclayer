import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function useOrganizationWorkspaceContext() {
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const workspacesQuery = useQuery({
    queryKey: ["organization", "workspaces", "active-context"],
    queryFn: async () => listOrganizationWorkspaces({ page: 1, size: 100, archived: false }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const resolved = useMemo(() => {
    const items = workspacesQuery.data?.items ?? [];
    if (!items.length) {
      return { workspaceId: null as string | null, workspaceName: null as string | null };
    }

    const matchedCurrent = currentWorkspaceId
      ? items.find((item) => String(item.workspaceId) === String(currentWorkspaceId))
      : undefined;

    const selected = matchedCurrent ?? items[0] ?? null;

    return {
      workspaceId: selected?.workspaceId ? String(selected.workspaceId) : null,
      workspaceName: selected?.name ?? null,
    };
  }, [currentWorkspaceId, workspacesQuery.data?.items]);

  return {
    ...resolved,
    isLoading: workspacesQuery.isLoading,
    isError: workspacesQuery.isError,
    error: workspacesQuery.error,
    refetch: workspacesQuery.refetch,
  };
}
