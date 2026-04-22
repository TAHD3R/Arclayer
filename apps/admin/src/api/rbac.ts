import { api } from "@/lib/http";
import { projectPath, toQueryString, workspacePath } from "@/lib/api";

import type { PageData, Permission, ProjectPermissionAction, RbacMatrix, Role } from "@/types/api";
import type { WorkspacePermissionAction } from "@/types/api/rbac";

export async function listWorkspaceRoles(
  workspaceId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<Role>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<Role>>(workspacePath(workspaceId, `/rbac/roles${query}`));
}

export async function listWorkspacePermissions(
  workspaceId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<Permission>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<Permission>>(workspacePath(workspaceId, `/rbac/permissions${query}`));
}

export async function getWorkspaceRbacMatrix(workspaceId: string): Promise<RbacMatrix> {
  return api.get<RbacMatrix>(workspacePath(workspaceId, "/rbac/matrix"));
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
}): Promise<void> {
  const { workspaceId, roleCode, permissionCodes } = input;
  await api.put<null>(
    workspacePath(workspaceId, `/rbac/roles/${encodeURIComponent(roleCode)}/permissions`),
    { permissionCodes },
  );
}
