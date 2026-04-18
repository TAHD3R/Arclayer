import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  PageData,
  ProjectArchiveResult,
  ProjectCreateInput,
  ProjectDangerCapabilities,
  ProjectDeleteResult,
  ProjectDetail,
  ProjectListItem,
  ProjectSlugAvailability,
  ProjectUpdateInput,
} from "@/types/api";

export async function getProjectDetail(projectId: string): Promise<ProjectDetail> {
  return api.get<ProjectDetail>(projectPath(projectId));
}

export async function listProjects(
  params: {
    workspaceId?: string;
    page?: number;
    size?: number;
    q?: string;
    archived?: boolean;
  } = {},
): Promise<PageData<ProjectListItem>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    workspaceId: params.workspaceId,
    q: params.q,
    archived: params.archived,
  });
  return api.get<PageData<ProjectListItem>>(`/projects${query}`);
}

export async function createProject(payload: ProjectCreateInput): Promise<ProjectDetail> {
  return api.post<ProjectDetail>("/projects", payload);
}

export async function patchProject(
  projectId: string,
  payload: ProjectUpdateInput,
): Promise<ProjectDetail> {
  return api.patch<ProjectDetail>(projectPath(projectId), payload);
}

export async function archiveProject(projectId: string): Promise<ProjectArchiveResult> {
  return api.post<ProjectArchiveResult>(projectPath(projectId, "/archive"));
}

export async function unarchiveProject(projectId: string): Promise<ProjectArchiveResult> {
  return api.post<ProjectArchiveResult>(projectPath(projectId, "/unarchive"));
}

export async function deleteProject(
  projectId: string,
  confirmName: string,
): Promise<ProjectDeleteResult> {
  return api.delete<ProjectDeleteResult>(
    `${projectPath(projectId)}${toQueryString({ confirmName })}`,
  );
}

export async function getProjectDangerCapabilities(
  projectId: string,
): Promise<ProjectDangerCapabilities> {
  return api.get<ProjectDangerCapabilities>(projectPath(projectId, "/danger-capabilities"));
}

export async function checkProjectSlugAvailability(
  workspaceId: string,
  slug: string,
  projectId?: string,
): Promise<ProjectSlugAvailability> {
  return api.get<ProjectSlugAvailability>(
    `/projects/slug-availability${toQueryString({ workspaceId, slug, projectId })}`,
  );
}
