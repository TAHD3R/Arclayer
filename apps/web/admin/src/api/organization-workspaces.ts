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
  enterable: boolean;
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

function organizationWorkspacesBasePath(organizationId?: string): string {
  if (!organizationId) return "/organizations/me/workspaces";
  const id = encodeURIComponent(String(organizationId));
  return `/organizations/${id}/workspaces`;
}

export async function listOrganizationWorkspaces(params: {
  organizationId?: string;
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  archived?: boolean;
  enterableOnly?: boolean;
}): Promise<PageData<OrganizationWorkspace>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    ordering: params.ordering,
    archived: params.archived,
    enterable_only: params.enterableOnly,
  });
  return api.get<PageData<OrganizationWorkspace>>(
    `${organizationWorkspacesBasePath(params.organizationId)}${query}`,
  );
}

export async function listAllOrganizationWorkspaces(params: {
  organizationId?: string;
  q?: string;
  ordering?: string;
  archived?: boolean;
  enterableOnly?: boolean;
  pageSize?: number;
} = {}): Promise<OrganizationWorkspace[]> {
  const size = Math.max(1, params.pageSize ?? 100);
  let page = 1;
  const items: OrganizationWorkspace[] = [];

  for (;;) {
    const result = await listOrganizationWorkspaces({
      organizationId: params.organizationId,
      page,
      size,
      q: params.q,
      ordering: params.ordering,
      archived: params.archived,
      enterableOnly: params.enterableOnly,
    });

    items.push(...result.items);

    if (!result.next || result.page >= result.pages) break;
    page = result.next;
  }

  return items;
}

export async function listOrganizationWorkspaceMembers(
  organizationId: string | undefined,
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
    `${organizationWorkspacesBasePath(organizationId)}/${id}/members${query}`,
  );
}

export async function createOrganizationWorkspace(
  organizationId: string | undefined,
  payload: OrganizationWorkspaceCreateInput,
): Promise<OrganizationWorkspace> {
  return api.post<OrganizationWorkspace>(organizationWorkspacesBasePath(organizationId), payload);
}

export async function archiveOrganizationWorkspace(
  organizationId: string | undefined,
  workspaceId: string,
): Promise<OrganizationWorkspaceArchiveResult> {
  const id = encodeURIComponent(String(workspaceId));
  return api.post<OrganizationWorkspaceArchiveResult>(
    `${organizationWorkspacesBasePath(organizationId)}/${id}/archive`,
  );
}

export async function unarchiveOrganizationWorkspace(
  organizationId: string | undefined,
  workspaceId: string,
): Promise<OrganizationWorkspaceArchiveResult> {
  const id = encodeURIComponent(String(workspaceId));
  return api.post<OrganizationWorkspaceArchiveResult>(
    `${organizationWorkspacesBasePath(organizationId)}/${id}/unarchive`,
  );
}

export async function deleteOrganizationWorkspace(
  organizationId: string | undefined,
  workspaceId: string,
  confirmName: string,
): Promise<{ workspaceId: string; deleted: boolean }> {
  const id = encodeURIComponent(String(workspaceId));
  const query = toQueryString({ confirmName });
  return api.delete<{ workspaceId: string; deleted: boolean }>(
    `${organizationWorkspacesBasePath(organizationId)}/${id}${query}`,
  );
}
