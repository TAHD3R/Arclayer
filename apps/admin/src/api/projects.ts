import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  ProjectArchiveResult,
  ProjectCreateRequest as ProjectCreateInput,
  ProjectDangerCapabilitiesOut as ProjectDangerCapabilities,
  ProjectDeleteResult,
  ProjectDetailOut,
  ProjectListItemOut,
  ProjectMemberPreviewOut,
  ProjectOut,
  ProjectSlugAvailabilityOut as ProjectSlugAvailability,
  ProjectUpdateRequest as ProjectUpdateInput,
  ProjectListOut,
  DomainProjectsListProjectsData,
} from "@arclayer/openapi";

type ListProjectsParams = NonNullable<DomainProjectsListProjectsData["query"]>;
type Project = Omit<ProjectOut, "description" | "iconColor" | "iconMode" | "iconUrl"> & {
  description: string | null;
  iconColor: string;
  iconMode: NonNullable<ProjectOut["iconMode"]>;
  iconUrl: string | null;
};
type ProjectListMemberPreview = Omit<
  ProjectMemberPreviewOut,
  "avatarUrl" | "displayName" | "email"
> & {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
};
type ProjectListItem = Omit<
  ProjectListItemOut,
  | "archivedAt"
  | "archivedByUserId"
  | "description"
  | "enterable"
  | "iconColor"
  | "iconMode"
  | "iconUrl"
  | "memberCount"
  | "membersPreview"
  | "primaryRuntime"
> & {
  archivedAt: string | null;
  archivedByUserId: string | null;
  description: string | null;
  enterable: boolean;
  iconColor: string;
  iconMode: NonNullable<ProjectListItemOut["iconMode"]>;
  iconUrl: string | null;
  memberCount: number;
  membersPreview: ProjectListMemberPreview[];
  primaryRuntime: NonNullable<ProjectListItemOut["primaryRuntime"]> | null;
};
type ProjectDetail = Omit<ProjectDetailOut, "primaryRuntime" | "project"> & {
  primaryRuntime: NonNullable<ProjectDetailOut["primaryRuntime"]> | null;
  project: Project;
};

type ProjectPage = Omit<ProjectListOut, "items"> & {
  items: ProjectListItem[];
};

function requireProject(project: ProjectOut): Project {
  if (
    project.description === undefined ||
    project.iconColor === undefined ||
    project.iconMode === undefined ||
    project.iconUrl === undefined
  ) {
    throw new Error("Invalid project response");
  }
  return {
    ...project,
    description: project.description,
    iconColor: project.iconColor,
    iconMode: project.iconMode,
    iconUrl: project.iconUrl,
  };
}

function requireProjectListItem(project: ProjectListItemOut): ProjectListItem {
  if (
    project.archivedAt === undefined ||
    project.archivedByUserId === undefined ||
    project.description === undefined ||
    typeof project.enterable !== "boolean" ||
    project.iconColor === undefined ||
    project.iconMode === undefined ||
    project.iconUrl === undefined ||
    typeof project.memberCount !== "number" ||
    !Array.isArray(project.membersPreview) ||
    project.primaryRuntime === undefined
  ) {
    throw new Error("Invalid project list item response");
  }
  const membersPreview = project.membersPreview.map((member) => {
    if (
      member.avatarUrl === undefined ||
      member.displayName === undefined ||
      member.email === undefined
    ) {
      throw new Error("Invalid project member preview response");
    }
    return {
      ...member,
      avatarUrl: member.avatarUrl,
      displayName: member.displayName,
      email: member.email,
    };
  });
  return {
    ...project,
    archivedAt: project.archivedAt,
    archivedByUserId: project.archivedByUserId,
    description: project.description,
    enterable: project.enterable,
    iconColor: project.iconColor,
    iconMode: project.iconMode,
    iconUrl: project.iconUrl,
    memberCount: project.memberCount,
    membersPreview,
    primaryRuntime: project.primaryRuntime,
  };
}

function requireProjectDetail(detail: ProjectDetailOut): ProjectDetail {
  if (detail.primaryRuntime === undefined) {
    throw new Error("Invalid project detail response");
  }
  return {
    ...detail,
    primaryRuntime: detail.primaryRuntime,
    project: requireProject(detail.project),
  };
}

function requireProjectPage(page: ProjectListOut): ProjectPage {
  if (
    !Array.isArray(page.items) ||
    typeof page.page !== "number" ||
    typeof page.pages !== "number" ||
    typeof page.size !== "number" ||
    typeof page.total !== "number"
  ) {
    throw new Error("Invalid project pagination response");
  }
  return { ...page, items: page.items.map(requireProjectListItem) };
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail> {
  return requireProjectDetail(await api.get<ProjectDetailOut>(projectPath(projectId)));
}

export async function listProjects(params: ListProjectsParams = {}): Promise<ProjectPage> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    workspaceId: params.workspaceId,
    q: params.q,
    archived: params.archived,
    ordering: params.ordering,
  });
  const page = await api.get<ProjectListOut>(`/projects${query}`);
  return requireProjectPage(page);
}

export async function createProject(payload: ProjectCreateInput): Promise<ProjectListItem> {
  return requireProjectListItem(await api.post<ProjectListItemOut>("/projects", payload));
}

export async function patchProject(
  projectId: string,
  payload: ProjectUpdateInput,
): Promise<ProjectDetail> {
  return requireProjectDetail(await api.patch<ProjectDetailOut>(projectPath(projectId), payload));
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
