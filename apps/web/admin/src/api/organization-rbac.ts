import { api } from "@/lib/http";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type OrganizationRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isBuiltin: boolean;
};

export type OrganizationPermission = {
  id: string;
  code: string;
  module: string;
  name: string;
  description: string | null;
};

export type OrganizationRbacMatrixPermissionRow = {
  code: string;
  module: string;
  name: string;
  description: string | null;
  grantedRoleCodes: string[];
};

export type OrganizationRbacMatrix = {
  roles: OrganizationRole[];
  permissions: OrganizationRbacMatrixPermissionRow[];
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listOrganizationRoles(params: { page?: number; size?: number } = {}): Promise<PageData<OrganizationRole>> {
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
  const code = encodeURIComponent(String(roleCode));
  await api.delete<null>(`/organizations/me/rbac/roles/${code}`);
}

export async function setOrganizationPermissionRoles(input: {
  permissionCode: string;
  roleCodes: string[];
}): Promise<void> {
  const code = encodeURIComponent(String(input.permissionCode));
  await api.put<null>(`/organizations/me/rbac/permissions/${code}/roles`, {
    roleCodes: input.roleCodes,
  });
}

export async function setOrganizationRolePermissions(input: {
  roleCode: string;
  permissionCodes: string[];
}): Promise<void> {
  const roleCode = encodeURIComponent(String(input.roleCode));
  await api.put<null>(`/organizations/me/rbac/roles/${roleCode}/permissions`, {
    permissionCodes: input.permissionCodes,
  });
}
