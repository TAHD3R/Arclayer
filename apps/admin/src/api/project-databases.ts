import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";

import type {
  ProjectDatabaseCreateIn,
  ProjectDatabaseDetailOut,
  ProjectDatabaseInstanceOut,
  ProjectDatabaseListOut,
  ProjectDatabaseRotateCredentialIn,
} from "@arclayer/openapi";

export function buildProjectDatabasesQueryKey(projectId: string) {
  return ["project", "databases", projectId] as const;
}

export async function listProjectDatabases(
  projectId: string,
): Promise<ProjectDatabaseInstanceOut[]> {
  const data = await api.get<ProjectDatabaseListOut>(projectPath(projectId, "/databases"));
  return data.items ?? [];
}

export async function createProjectDatabase(
  projectId: string,
  payload: ProjectDatabaseCreateIn,
): Promise<ProjectDatabaseDetailOut> {
  return api.post<ProjectDatabaseDetailOut>(projectPath(projectId, "/databases"), payload);
}

export async function rotateProjectDatabaseCredential(
  projectId: string,
  databaseId: string,
  payload: ProjectDatabaseRotateCredentialIn,
): Promise<ProjectDatabaseDetailOut> {
  return api.post<ProjectDatabaseDetailOut>(
    projectPath(projectId, `/databases/${encodeURIComponent(databaseId)}/credentials/rotate`),
    payload,
  );
}
