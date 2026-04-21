import { api } from "@/lib/http";
import type {
  SystemDirectoryOrganizationDetail,
  SystemDirectoryOrganizationPage,
  SystemDirectoryProjectDetail,
  SystemDirectoryProjectPage,
  SystemDirectoryUserDetail,
  SystemDirectoryUserPage,
  SystemDirectoryWorkspaceDetail,
  SystemDirectoryWorkspacePage,
} from "@/types/api/system-directory";

type SystemDirectoryListParams = {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
};

function buildQuery(params: SystemDirectoryListParams) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.size) query.set("size", String(params.size));
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.ordering?.trim()) query.set("ordering", params.ordering.trim());
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listSystemDirectoryUsers(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryUserPage> {
  return api.get<SystemDirectoryUserPage>(`/system/directory/users${buildQuery(params)}`);
}

export async function listSystemDirectoryOrganizations(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryOrganizationPage> {
  return api.get<SystemDirectoryOrganizationPage>(
    `/system/directory/organizations${buildQuery(params)}`,
  );
}

export async function listSystemDirectoryWorkspaces(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryWorkspacePage> {
  return api.get<SystemDirectoryWorkspacePage>(`/system/directory/workspaces${buildQuery(params)}`);
}

export async function listSystemDirectoryProjects(
  params: SystemDirectoryListParams = {},
): Promise<SystemDirectoryProjectPage> {
  return api.get<SystemDirectoryProjectPage>(`/system/directory/projects${buildQuery(params)}`);
}

export async function getSystemDirectoryUserDetail(
  userId: string,
): Promise<SystemDirectoryUserDetail> {
  return api.get<SystemDirectoryUserDetail>(`/system/directory/users/${userId}`);
}

export async function getSystemDirectoryOrganizationDetail(
  organizationId: string,
): Promise<SystemDirectoryOrganizationDetail> {
  return api.get<SystemDirectoryOrganizationDetail>(
    `/system/directory/organizations/${organizationId}`,
  );
}

export async function getSystemDirectoryWorkspaceDetail(
  workspaceId: string,
): Promise<SystemDirectoryWorkspaceDetail> {
  return api.get<SystemDirectoryWorkspaceDetail>(`/system/directory/workspaces/${workspaceId}`);
}

export async function getSystemDirectoryProjectDetail(
  projectId: string,
): Promise<SystemDirectoryProjectDetail> {
  return api.get<SystemDirectoryProjectDetail>(`/system/directory/projects/${projectId}`);
}
