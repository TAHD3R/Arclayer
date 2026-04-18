import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type { PageData, ProjectMember, ProjectMemberRole } from "@/types/api";

export async function listProjectMembers(
  projectId: string,
  params: { page?: number; size?: number; q?: string } = {},
): Promise<PageData<ProjectMember>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
  });
  return api.get<PageData<ProjectMember>>(projectPath(projectId, `/members${query}`));
}

export async function updateProjectMemberRole(
  projectId: string,
  membershipId: string,
  payload: { role: ProjectMemberRole },
): Promise<ProjectMember> {
  return api.put<ProjectMember>(projectPath(projectId, `/members/${membershipId}/role`), payload);
}
