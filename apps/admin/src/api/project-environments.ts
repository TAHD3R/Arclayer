import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";

import type {
  ProjectEnvironmentListOut,
  ProjectEnvironmentOut,
  ProjectEnvironmentPatchIn,
} from "@arclayer/openapi";

export function buildProjectEnvironmentsQueryKey(projectId: string) {
  return ["project", "environments", projectId] as const;
}

export async function listProjectEnvironments(projectId: string): Promise<ProjectEnvironmentOut[]> {
  const data = await api.get<ProjectEnvironmentListOut>(projectPath(projectId, "/environments"));
  return data.items ?? [];
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
