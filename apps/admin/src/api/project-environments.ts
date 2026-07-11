import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";

import type {
  ProjectEnvironmentAliasOut,
  ProjectEnvironmentAliasSwitchIn,
  ProjectEnvironmentCloneIn,
  ProjectEnvironmentCopyOut,
  ProjectEnvironmentListOut,
  ProjectEnvironmentOut,
  ProjectEnvironmentPatchIn,
  ProjectEnvironmentPromoteIn,
} from "@arclayer/openapi";

export function buildProjectEnvironmentsQueryKey(projectId: string) {
  return ["project", "environments", projectId] as const;
}

export async function listProjectEnvironments(projectId: string): Promise<ProjectEnvironmentOut[]> {
  const data = await getProjectEnvironmentState(projectId);
  return data.items ?? [];
}

export async function getProjectEnvironmentState(
  projectId: string,
): Promise<ProjectEnvironmentListOut> {
  return api.get<ProjectEnvironmentListOut>(projectPath(projectId, "/environments"));
}

export async function patchProjectEnvironment(
  projectId: string,
  environmentId: string,
  payload: ProjectEnvironmentPatchIn,
): Promise<ProjectEnvironmentOut> {
  return api.patch<ProjectEnvironmentOut>(
    projectPath(projectId, `/environments/${encodeURIComponent(environmentId)}`),
    payload,
  );
}

export async function switchProjectEnvironmentAlias(
  projectId: string,
  aliasKey: string,
  payload: ProjectEnvironmentAliasSwitchIn,
): Promise<ProjectEnvironmentAliasOut> {
  return api.patch<ProjectEnvironmentAliasOut>(
    projectPath(projectId, `/environments/aliases/${encodeURIComponent(aliasKey)}`),
    payload,
  );
}

export async function cloneProjectEnvironment(
  projectId: string,
  payload: ProjectEnvironmentCloneIn,
): Promise<ProjectEnvironmentCopyOut> {
  return api.post<ProjectEnvironmentCopyOut>(
    projectPath(projectId, "/environments/clone"),
    payload,
  );
}

export async function promoteProjectEnvironment(
  projectId: string,
  payload: ProjectEnvironmentPromoteIn,
): Promise<ProjectEnvironmentCopyOut> {
  return api.post<ProjectEnvironmentCopyOut>(
    projectPath(projectId, "/environments/promote"),
    payload,
  );
}
