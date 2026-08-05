import { useQuery } from "@tanstack/react-query";

import { getWorkspaceCommerceOverview } from "@/api/commerce";
import {
  includesWorkspaceRoleManagement,
  WORKSPACE_COMMERCE_MANAGE_PERMISSION,
  workspaceCommerceOverviewQueryKey,
} from "@/lib/commerce/member-credit-contracts";
import { useWorkspacePermissionAccess } from "@/hooks/use-workspace-permission-access";

export type WorkspaceCommerceManagementAccessStatus = "loading" | "error" | "view" | "manage";

export function useWorkspaceCommerceManagementAccess(workspaceId: string | null | undefined) {
  const normalizedWorkspaceId = workspaceId ? String(workspaceId) : null;
  const permissionAccess = useWorkspacePermissionAccess(normalizedWorkspaceId);
  const overviewQuery = useQuery({
    queryKey: workspaceCommerceOverviewQueryKey(normalizedWorkspaceId ?? "unselected"),
    enabled: Boolean(normalizedWorkspaceId),
    queryFn: ({ signal }) => {
      if (!normalizedWorkspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return getWorkspaceCommerceOverview(normalizedWorkspaceId, signal);
    },
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const isWorkspaceOwner = Boolean(permissionAccess.authzQuery.data?.isWorkspaceOwner);
  const ownerOrSuperuser = isWorkspaceOwner || permissionAccess.isSuperuser;
  const rolesManagementIncluded = includesWorkspaceRoleManagement(
    overviewQuery.data?.planRevision.entitlements ?? [],
  );
  const canManageCommerce =
    permissionAccess.authzQuery.isSuccess &&
    (ownerOrSuperuser ||
      (overviewQuery.isSuccess &&
        rolesManagementIncluded &&
        permissionAccess.hasPermission(WORKSPACE_COMMERCE_MANAGE_PERMISSION)));

  let status: WorkspaceCommerceManagementAccessStatus;
  if (!normalizedWorkspaceId) {
    status = "view";
  } else if (permissionAccess.authzQuery.isPending) {
    status = "loading";
  } else if (permissionAccess.authzQuery.isError) {
    status = "error";
  } else if (ownerOrSuperuser) {
    status = "manage";
  } else if (overviewQuery.isPending) {
    status = "loading";
  } else if (overviewQuery.isError) {
    status = "error";
  } else {
    status = canManageCommerce ? "manage" : "view";
  }

  return {
    overviewQuery,
    permissionAccess,
    managementAccessStatus: status,
    canManageCommerce,
    isWorkspaceOwner,
    error: permissionAccess.authzQuery.error ?? overviewQuery.error,
    retry: async () => {
      await Promise.all([permissionAccess.authzQuery.refetch(), overviewQuery.refetch()]);
    },
  } as const;
}
