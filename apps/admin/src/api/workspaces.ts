import { api } from "@/lib/http";
import { projectPath, workspacePath, toQueryString } from "@/lib/api";
import type {
  OnboardingWorkspaceCreateRequest as OnboardingWorkspaceCreatePayload,
  OnboardingWorkspaceCreateOut as OnboardingWorkspaceCreateResult,
} from "@arclayer/openapi";
import type {
  AuthzSnapshot,
  ProjectAuthzSnapshot,
  LeaveWorkspaceResult,
  MyWorkspaceListResult,
  WorkspaceAssignRoleToMembersResult as WorkspaceAssignRoleResult,
  WorkspaceDangerCapabilitiesOut as WorkspaceDangerCapabilities,
  WorkspaceDeleteResult,
  WorkspaceDetailOut as WorkspaceDetail,
  WorkspaceRolePolicyOut as WorkspaceRolePolicy,
} from "@arclayer/openapi";

export async function listMyWorkspaces(): Promise<MyWorkspaceListResult> {
  return api.get<MyWorkspaceListResult>("/me/workspaces");
}

export async function createMyOnboardingWorkspace(
  payload: OnboardingWorkspaceCreatePayload,
): Promise<OnboardingWorkspaceCreateResult> {
  return api.post<OnboardingWorkspaceCreateResult>("/me/workspaces/onboarding", payload);
}

export async function getMyWorkspaceAuthz(workspaceId: string): Promise<AuthzSnapshot> {
  return api.get<AuthzSnapshot>(workspacePath(workspaceId, "/me/authz"));
}

export async function getMyProjectAuthz(projectId: string): Promise<ProjectAuthzSnapshot> {
  return api.get<ProjectAuthzSnapshot>(projectPath(projectId, "/me/authz"));
}

export async function getWorkspaceDetail(workspaceId: string): Promise<WorkspaceDetail> {
  return api.get<WorkspaceDetail>(workspacePath(workspaceId, ""));
}

export async function patchWorkspaceDetail(
  workspaceId: string,
  payload: {
    name?: string;
    description?: string | null;
    iconMode?: "initials" | "glyph" | "emoji" | "image";
    iconColor?: string | null;
    iconGlyph?: string | null;
    iconEmoji?: string | null;
    iconUrl?: string | null;
  },
): Promise<WorkspaceDetail> {
  return api.patch<WorkspaceDetail>(workspacePath(workspaceId, ""), payload);
}

export async function getWorkspaceDangerCapabilities(
  workspaceId: string,
): Promise<WorkspaceDangerCapabilities> {
  return api.get<WorkspaceDangerCapabilities>(workspacePath(workspaceId, "/danger-capabilities"));
}

export async function leaveWorkspace(
  workspaceId: string,
  confirmText: string,
): Promise<LeaveWorkspaceResult> {
  return api.post<LeaveWorkspaceResult>(workspacePath(workspaceId, "/leave"), { confirmText });
}

export async function deleteWorkspace(
  workspaceId: string,
  confirmName: string,
): Promise<WorkspaceDeleteResult> {
  return api.delete<WorkspaceDeleteResult>(
    `${workspacePath(workspaceId, "")}${toQueryString({ confirmName })}`,
  );
}

export async function getWorkspaceRolePolicy(workspaceId: string): Promise<WorkspaceRolePolicy> {
  return api.get<WorkspaceRolePolicy>(workspacePath(workspaceId, "/settings/role-policy"));
}

export async function patchWorkspaceRolePolicy(
  workspaceId: string,
  payload: { defaultRoleCode: string },
): Promise<WorkspaceRolePolicy> {
  return api.patch<WorkspaceRolePolicy>(
    workspacePath(workspaceId, "/settings/role-policy"),
    payload,
  );
}

export async function assignWorkspaceRoleToAllUsers(
  workspaceId: string,
  payload: { roleCode: string; confirmName: string },
): Promise<WorkspaceAssignRoleResult> {
  return api.post<WorkspaceAssignRoleResult>(
    workspacePath(workspaceId, "/settings/role-policy/assign-all"),
    payload,
  );
}
