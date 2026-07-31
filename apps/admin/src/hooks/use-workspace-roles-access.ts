import { useQuery } from "@tanstack/react-query";

import { getWorkspaceCommerceOverview } from "@/api/commerce";

export const WORKSPACE_ROLES_FEATURE_KEY = "workspace.roles.manage";

export type WorkspaceRolesAccessStatus = "loading" | "available" | "unavailable" | "error";

function includesWorkspaceRoleManagement(
  entitlements: ReadonlyArray<{ key: string; isIncluded: boolean }>,
): boolean {
  const matches = entitlements.filter(
    (entitlement) => entitlement.key === WORKSPACE_ROLES_FEATURE_KEY,
  );
  return matches.length === 1 && matches[0]?.isIncluded === true;
}

export function useWorkspaceRolesAccess(workspaceId: string | null) {
  const query = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "overview"],
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
