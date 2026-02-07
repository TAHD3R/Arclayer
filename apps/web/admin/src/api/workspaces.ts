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
  payload: { name?: string },
): Promise<WorkspaceDetail> {
  const id = encodeURIComponent(String(workspaceId));
  return api.patch<WorkspaceDetail>(`/workspaces/${id}`, payload);
}
