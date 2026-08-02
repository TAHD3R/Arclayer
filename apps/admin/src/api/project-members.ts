import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  ProjectMemberOut as ProjectMember,
  PageDataProjectMemberOut,
} from "@arclayer/openapi";

type ProjectMemberPage = Omit<PageDataProjectMemberOut, "items"> & {
  items: NonNullable<PageDataProjectMemberOut["items"]>;
};

function requireProjectMemberPage(page: PageDataProjectMemberOut): ProjectMemberPage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid project member pagination response");
  }
  return { ...page, items: page.items };
}

export async function listProjectMembers(
  projectId: string,
  params: {
    page?: number;
    size?: number;
    q?: string;
  } = {},
): Promise<ProjectMemberPage> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  const page = await api.get<PageDataProjectMemberOut>(projectPath(projectId, `/members${query}`));
  return requireProjectMemberPage(page);
}

export async function updateProjectMemberRole(
  projectId: string,
  membershipId: string,
  payload: { role: ProjectMember["role"] },
): Promise<ProjectMember> {
  return api.put<ProjectMember>(projectPath(projectId, `/members/${membershipId}/role`), payload);
}
