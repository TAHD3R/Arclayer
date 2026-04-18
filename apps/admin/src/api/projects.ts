import { projectPath, workspacePath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type { PageData, ProjectCreateInput, ProjectDetail, ProjectListItem } from "@/types/api";

export async function getProjectDetail(projectId: string): Promise<ProjectDetail> {
  return api.get<ProjectDetail>(projectPath(projectId));
}

export async function listWorkspaceProjects(
  workspaceId: string,
  params: {
    page?: number;
    size?: number;
    q?: string;
  } = {},
): Promise<PageData<ProjectListItem>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
  });
  return api.get<PageData<ProjectListItem>>(workspacePath(workspaceId, `/projects${query}`));
}

export async function createWorkspaceProject(
  workspaceId: string,
  payload: ProjectCreateInput,
): Promise<ProjectDetail> {
  return api.post<ProjectDetail>(workspacePath(workspaceId, "/projects"), payload);
}
