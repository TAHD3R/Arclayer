import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listWorkspacePermissionActions } from "@/api/rbac";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import type { WorkspacePermissionAction } from "@/types/api/rbac";

type UseWorkspacePermissionAccessResult = {
  authzQuery: ReturnType<typeof useQuery>;
  actionsQuery: ReturnType<typeof useQuery>;
  permissionCodes: string[];
  actionCatalog: WorkspacePermissionAction[];
  isSuperuser: boolean;
  hasPermission: (permissionCode: string) => boolean;
  hasAction: (actionCode: string) => boolean;
};

export function useWorkspacePermissionAccess(
  workspaceId: string | null | undefined,
): UseWorkspacePermissionAccessResult {
  const authzQuery = useQuery({
    queryKey: ["workspace", "authz", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return getMyWorkspaceAuthz(workspaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const actionsQuery = useQuery({
    queryKey: ["workspace", "permission-actions", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return listWorkspacePermissionActions(workspaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const permissionCodes = authzQuery.data?.permissionCodes ?? [];
  const isSuperuser = Boolean(authzQuery.data?.isSuperuser);
  const permissionCodeSet = useMemo(() => new Set(permissionCodes), [permissionCodes]);
  const actionCatalog = actionsQuery.data ?? [];
  const actionPermissionMap = useMemo(
    () =>
      new Map(
        actionCatalog.map((action) => [
          action.code,
          (action.permissionCodes ?? []).filter((code) => String(code || "").trim().length > 0),
        ]),
      ),
    [actionCatalog],
  );

  const hasPermission = (permissionCode: string) =>
    isSuperuser || permissionCodeSet.has(String(permissionCode || "").trim());

  const hasAction = (actionCode: string) => {
    if (isSuperuser) return true;
    const mappedPermissions = actionPermissionMap.get(String(actionCode || "").trim()) ?? [];
    return mappedPermissions.some((permissionCode) => permissionCodeSet.has(permissionCode));
  };

  return {
    authzQuery,
    actionsQuery,
    permissionCodes,
    actionCatalog,
    isSuperuser,
    hasPermission,
    hasAction,
  };
}
