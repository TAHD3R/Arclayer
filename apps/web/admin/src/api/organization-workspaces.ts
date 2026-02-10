import { api } from "@/lib/http";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type OrganizationWorkspaceTemplate = "blog" | "website" | "blank";

export type OrganizationWorkspaceMemberPreview = {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type OrganizationWorkspaceMember = {
  membershipId: string;
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: string;
};

export type OrganizationWorkspace = {
  id: string;
  workspaceId: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  archivedByUserId: string | null;
  memberCount: number;
  membersPreview: OrganizationWorkspaceMemberPreview[];
  createdAt: string;
};

export type OrganizationWorkspaceArchiveResult = {
  workspaceId: string;
  isArchived: boolean;
  archivedAt: string | null;
  archivedByUserId: string | null;
};

export type OrganizationWorkspaceCreateInput = {
  name: string;
  description?: string;
  template: OrganizationWorkspaceTemplate;
  locale?: string;
  timezone?: string;
  dateFormat?: string;
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listOrganizationWorkspaces(params: {
  page?: number;
  size?: number;
  q?: string;
  archived?: boolean;
}): Promise<PageData<OrganizationWorkspace>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    archived: params.archived,
  });
  return api.get<PageData<OrganizationWorkspace>>(`/organizations/me/workspaces${query}`);
}

export async function listOrganizationWorkspaceMembers(
  workspaceId: string,
  params: {
    page?: number;
    size?: number;
    q?: string;
  },
): Promise<PageData<OrganizationWorkspaceMember>> {
  const id = encodeURIComponent(String(workspaceId));
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  return api.get<PageData<OrganizationWorkspaceMember>>(
    `/organizations/me/workspaces/${id}/members${query}`,
  );
}

export async function createOrganizationWorkspace(
  payload: OrganizationWorkspaceCreateInput,
): Promise<OrganizationWorkspace> {
  return api.post<OrganizationWorkspace>("/organizations/me/workspaces", payload);
}

export async function archiveOrganizationWorkspace(
  workspaceId: string,
): Promise<OrganizationWorkspaceArchiveResult> {
  const id = encodeURIComponent(String(workspaceId));
  return api.post<OrganizationWorkspaceArchiveResult>(`/organizations/me/workspaces/${id}/archive`);
}

export async function unarchiveOrganizationWorkspace(
  workspaceId: string,
): Promise<OrganizationWorkspaceArchiveResult> {
  const id = encodeURIComponent(String(workspaceId));
  return api.post<OrganizationWorkspaceArchiveResult>(`/organizations/me/workspaces/${id}/unarchive`);
}

export async function deleteOrganizationWorkspace(
  workspaceId: string,
  confirmName: string,
): Promise<{ workspaceId: string; deleted: boolean }> {
  const id = encodeURIComponent(String(workspaceId));
  const query = toQueryString({ confirmName });
  return api.delete<{ workspaceId: string; deleted: boolean }>(
    `/organizations/me/workspaces/${id}${query}`,
  );
}
