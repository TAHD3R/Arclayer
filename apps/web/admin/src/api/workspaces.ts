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

export async function listMyWorkspaces(): Promise<MyWorkspaceListResult> {
  return api.get<MyWorkspaceListResult>("/me/workspaces");
}

export async function getMyWorkspaceAuthz(workspaceId: string): Promise<AuthzSnapshot> {
  const id = encodeURIComponent(String(workspaceId));
  return api.get<AuthzSnapshot>(`/workspaces/${id}/me/authz`);
}
