import { useQuery } from "@tanstack/react-query";

import { getWorkspaceCommerceOverview } from "@/api/commerce";
import {
  includesWorkspaceRoleManagement,
  workspaceCommerceOverviewQueryKey,
} from "@/lib/commerce/member-credit-contracts";

export type WorkspaceRolesAccessStatus = "loading" | "available" | "unavailable" | "error";

export function useWorkspaceRolesAccess(workspaceId: string | null) {
  const query = useQuery({
    queryKey: workspaceCommerceOverviewQueryKey(workspaceId ?? "unselected"),
    enabled: Boolean(workspaceId),
    queryFn: ({ signal }) => getWorkspaceCommerceOverview(String(workspaceId), signal),
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  let status: WorkspaceRolesAccessStatus;
  if (!workspaceId) {
    status = "unavailable";
  } else if (query.isPending) {
    status = "loading";
  } else if (query.isError) {
    status = "error";
  } else {
    status = includesWorkspaceRoleManagement(query.data.planRevision.entitlements)
      ? "available"
      : "unavailable";
  }

  return { status, error: query.error, refetch: query.refetch } as const;
}
