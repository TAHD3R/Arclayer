import { api } from "@/lib/http";

export interface MyWorkspace {
  workspaceId: string;
  organizationId: string;
  slug: string;
  name: string;
  visibleOnly: boolean;
  isCreatorAdmin: boolean;
}

export interface MyWorkspaceListResult {
  items: MyWorkspace[];
}

export interface AuthzSnapshot {
  userId: string;
  roleCodes: string[];
  permissionCodes: string[];
  isSuperuser: boolean;
}

export interface WorkspaceDetail {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
}

export interface WorkspaceRolePolicy {
  workspaceId: string;
  defaultRoleCode: string;
}

export interface WorkspaceAssignRoleResult {
  workspaceId: string;
  roleCode: string;
  updatedCount: number;
}

export async function listMyWorkspaces(): Promise<MyWorkspaceListResult> {
  return api.get<MyWorkspaceListResult>("/me/workspaces");
}

export async function getMyWorkspaceAuthz(workspaceId: string): Promise<AuthzSnapshot> {
  const id = encodeURIComponent(String(workspaceId));
  return api.get<AuthzSnapshot>(`/workspaces/${id}/me/authz`);
}

export async function getWorkspaceDetail(workspaceId: string): Promise<WorkspaceDetail> {
  const id = encodeURIComponent(String(workspaceId));
  return api.get<WorkspaceDetail>(`/workspaces/${id}`);
}

export async function patchWorkspaceDetail(
  workspaceId: string,
  payload: { name?: string; slug?: string },
): Promise<WorkspaceDetail> {
  const id = encodeURIComponent(String(workspaceId));
  return api.patch<WorkspaceDetail>(`/workspaces/${id}`, payload);
}

export async function leaveWorkspace(
  workspaceId: string,
  confirmText: string,
): Promise<{ workspaceId: string; membershipId: string; left: boolean }> {
  const id = encodeURIComponent(String(workspaceId));
  return api.post<{ workspaceId: string; membershipId: string; left: boolean }>(
    `/workspaces/${id}/leave`,
    { confirmText },
  );
}

export async function deleteWorkspace(
  workspaceId: string,
  confirmName: string,
): Promise<{ workspaceId: string; deleted: boolean }> {
  const id = encodeURIComponent(String(workspaceId));
  const query = new URLSearchParams({ confirmName }).toString();
  return api.delete<{ workspaceId: string; deleted: boolean }>(`/workspaces/${id}?${query}`);
}

export async function getWorkspaceRolePolicy(workspaceId: string): Promise<WorkspaceRolePolicy> {
  const id = encodeURIComponent(String(workspaceId));
  return api.get<WorkspaceRolePolicy>(`/workspaces/${id}/settings/role-policy`);
}

export async function patchWorkspaceRolePolicy(
  workspaceId: string,
  payload: { defaultRoleCode: string },
): Promise<WorkspaceRolePolicy> {
  const id = encodeURIComponent(String(workspaceId));
  return api.patch<WorkspaceRolePolicy>(`/workspaces/${id}/settings/role-policy`, payload);
}

export async function assignWorkspaceRoleToAllUsers(
  workspaceId: string,
  payload: { roleCode: string; confirmName: string },
): Promise<WorkspaceAssignRoleResult> {
  const id = encodeURIComponent(String(workspaceId));
  return api.post<WorkspaceAssignRoleResult>(
    `/workspaces/${id}/settings/role-policy/assign-all`,
    payload,
  );
}
