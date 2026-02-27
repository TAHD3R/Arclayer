import { api } from "@/lib/http";
import { toQueryString, orgRbacRolePath, orgRbacPermissionPath } from "@/lib/api";

import type {
  OrganizationPermission,
  OrganizationRbacMatrix,
  OrganizationRole,
  PageData,
} from "@/types/api";

export async function listOrganizationRoles(
  params: { page?: number; size?: number } = {},
): Promise<PageData<OrganizationRole>> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 200 });
  return api.get<PageData<OrganizationRole>>(`/organizations/me/rbac/roles${query}`);
}

export async function listOrganizationPermissions(
  params: { page?: number; size?: number } = {},
): Promise<PageData<OrganizationPermission>> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 200 });
  return api.get<PageData<OrganizationPermission>>(`/organizations/me/rbac/permissions${query}`);
}

export async function getOrganizationRbacMatrix(): Promise<OrganizationRbacMatrix> {
  return api.get<OrganizationRbacMatrix>("/organizations/me/rbac/matrix");
}

export async function createOrganizationRoleFromTemplate(input: {
  code?: string;
  templateRoleCode?: string | null;
  name: string;
  description?: string | null;
}): Promise<OrganizationRole> {
  return api.post<OrganizationRole>("/organizations/me/rbac/roles", input);
}

export async function deleteOrganizationRole(roleCode: string): Promise<void> {
  await api.delete<null>(orgRbacRolePath(roleCode));
}

export async function setOrganizationPermissionRoles(input: {
  permissionCode: string;
  roleCodes: string[];
}): Promise<void> {
  await api.put<null>(orgRbacPermissionPath(input.permissionCode, "/roles"), {
    roleCodes: input.roleCodes,
  });
}

export async function setOrganizationRolePermissions(input: {
  roleCode: string;
  permissionCodes: string[];
}): Promise<void> {
  await api.put<null>(orgRbacRolePath(input.roleCode, "/permissions"), {
    permissionCodes: input.permissionCodes,
  });
}
