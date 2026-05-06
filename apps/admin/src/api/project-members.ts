import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type { ProjectMember } from "@arclayer/openapi/admin-types";
import type { PageData } from "@arclayer/openapi/admin-types";

export async function listProjectMembers(
  projectId: string,
  params: {
    page?: number;
    size?: number;
    q?: string;
  } = {},
): Promise<PageData<ProjectMember>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  return api.get<PageData<ProjectMember>>(projectPath(projectId, `/members${query}`));
}

export async function updateProjectMemberRole(
  projectId: string,
  membershipId: string,
  payload: { role: ProjectMember["role"] },
): Promise<ProjectMember> {
  return api.put<ProjectMember>(projectPath(projectId, `/members/${membershipId}/role`), payload);
}
