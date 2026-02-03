import { api } from "@/lib/http";
import { workspacePath } from "@/api/_workspace";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isSuperuser: boolean;
  isSystem: boolean;
};

export type Permission = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  pluginId: string | null;
  pluginName?: string | null;
};

export type RbacMatrixPermissionRow = {
  code: string;
  name: string;
  description: string | null;
  pluginId: string | null;
  pluginName?: string | null;
  grantedRoleCodes: string[];
};

export type RbacMatrix = {
  roles: Role[];
  permissions: RbacMatrixPermissionRow[];
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        qs.append(k, String(item));
      }
      continue;
    }
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

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
