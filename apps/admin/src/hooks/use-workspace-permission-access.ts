import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { listProjectPermissionActions, listWorkspacePermissionActions } from "@/api/rbac";
import { getMyProjectAuthz, getMyWorkspaceAuthz } from "@/api/workspaces";
import type {
  AuthzSnapshot,
  ProjectAuthzSnapshot,
  ProjectPermissionAction,
} from "@arclayer/openapi/admin-types";
import type { WorkspacePermissionAction } from "@arclayer/openapi/admin-types";

type PermissionActionLike = {
  code: string;
  permissionCodes?: string[] | null;
};

type AuthzLike = {
  isSuperuser?: boolean | null;
  permissionCodes?: string[] | null;
  workspaceId?: string | null;
};

type UsePermissionAccessResult<TAction extends PermissionActionLike, TAuthz extends AuthzLike> = {
  authzQuery: UseQueryResult<TAuthz, Error>;
  actionsQuery: UseQueryResult<TAction[], Error>;
  permissionCodes: string[];
  actionCatalog: TAction[];
  isSuperuser: boolean;
  hasPermission: (permissionCode: string) => boolean;
  hasAction: (actionCode: string) => boolean;
};

export function useWorkspacePermissionAccess(
  workspaceId: string | null | undefined,
): UsePermissionAccessResult<WorkspacePermissionAction, AuthzSnapshot> {
  const authzQuery = useQuery<AuthzSnapshot, Error>({
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

  const actionsQuery = useQuery<WorkspacePermissionAction[], Error>({
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
          (action.permissionCodes ?? []).filter(
            (code: string) => String(code || "").trim().length > 0,
          ),
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

export function useProjectPermissionAccess(
  projectId: string | null | undefined,
): UsePermissionAccessResult<ProjectPermissionAction, ProjectAuthzSnapshot> {
  const authzQuery = useQuery<ProjectAuthzSnapshot, Error>({
    queryKey: ["project", "authz", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error("projectId is required");
      return getMyProjectAuthz(projectId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const actionsQuery = useQuery<ProjectPermissionAction[], Error>({
    queryKey: ["project", "permission-actions", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) throw new Error("projectId is required");
      return listProjectPermissionActions(projectId);
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
          (action.permissionCodes ?? []).filter(
            (code: string) => String(code || "").trim().length > 0,
          ),
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
