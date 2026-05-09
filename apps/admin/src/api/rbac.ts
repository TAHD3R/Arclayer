import { api } from "@/lib/http";
import { projectPath, toQueryString, workspacePath } from "@/lib/api";

import type {
  PageData,
  Permission,
  ProjectPermissionAction,
  Role,
} from "@arclayer/openapi/admin-types";
import type { RolePermissionGrant, WorkspacePermissionAction } from "@arclayer/openapi/admin-types";

const RBAC_PAGE_SIZE = 200;

async function listAllPages<T>(
  loader: (params: { page: number; size: number }) => Promise<PageData<T>>,
): Promise<T[]> {
  const loadPage = async (page: number, items: T[]): Promise<T[]> => {
    const result = await loader({ page, size: RBAC_PAGE_SIZE });
    const mergedItems = [...items, ...(result.items ?? [])];
    if (page >= (result.pages ?? page)) {
      return mergedItems;
    }
    return loadPage(page + 1, mergedItems);
  };

  return loadPage(1, []);
}

export async function listWorkspaceRoles(
  workspaceId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<Role>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? RBAC_PAGE_SIZE,
  });
  return api.get<PageData<Role>>(workspacePath(workspaceId, `/rbac/roles${query}`));
}

export async function listAllWorkspaceRoles(workspaceId: string): Promise<Role[]> {
  return listAllPages((params) => listWorkspaceRoles(workspaceId, params));
}

export async function listWorkspacePermissions(
  workspaceId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<Permission>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? RBAC_PAGE_SIZE,
  });
  return api.get<PageData<Permission>>(workspacePath(workspaceId, `/rbac/permissions${query}`));
}

export async function listAllWorkspacePermissions(workspaceId: string): Promise<Permission[]> {
  return listAllPages((params) => listWorkspacePermissions(workspaceId, params));
}

export async function listWorkspacePermissionActions(
  workspaceId: string,
): Promise<WorkspacePermissionAction[]> {
  return api.get<WorkspacePermissionAction[]>(workspacePath(workspaceId, "/rbac/actions"));
}

export async function listProjectPermissionActions(
  projectId: string,
): Promise<ProjectPermissionAction[]> {
  return api.get<ProjectPermissionAction[]>(projectPath(projectId, "/actions"));
}

export async function createWorkspaceRoleFromTemplate(input: {
  workspaceId: string;
  code?: string;
  templateRoleCode?: string | null;
  name?: string;
  description?: string | null;
}): Promise<Role> {
  const { workspaceId, ...body } = input;
  return api.post<Role>(workspacePath(workspaceId, "/rbac/roles"), body);
}

export async function updateWorkspaceRole(input: {
  workspaceId: string;
  roleCode: string;
  name?: string | null;
  description?: string | null;
}): Promise<Role> {
  const { workspaceId, roleCode, ...body } = input;
  return api.patch<Role>(
    workspacePath(workspaceId, `/rbac/roles/${encodeURIComponent(roleCode)}`),
    body,
  );
}

export async function deleteWorkspaceRole(input: {
  workspaceId: string;
  roleCode: string;
}): Promise<void> {
  const { workspaceId, roleCode } = input;
  await api.delete<null>(workspacePath(workspaceId, `/rbac/roles/${encodeURIComponent(roleCode)}`));
}

export async function setWorkspacePermissionRoles(input: {
  workspaceId: string;
  permissionCode: string;
  roleCodes: string[];
}): Promise<void> {
  const { workspaceId, permissionCode, roleCodes } = input;
  await api.put<null>(
    workspacePath(workspaceId, `/rbac/permissions/${encodeURIComponent(permissionCode)}/roles`),
    { roleCodes },
  );
}

export async function setWorkspaceRolePermissions(input: {
  workspaceId: string;
  roleCode: string;
  permissionCodes: string[];
  permissionGrants?: RolePermissionGrant[];
}): Promise<void> {
  const { workspaceId, roleCode, permissionCodes, permissionGrants } = input;
  await api.put<null>(
    workspacePath(workspaceId, `/rbac/roles/${encodeURIComponent(roleCode)}/permissions`),
    { permissionCodes, permissionGrants: permissionGrants ?? [] },
  );
}
