import { api } from "@/lib/http";
import {
  toQueryString,
  organizationWorkspacesBasePath,
  organizationWorkspacePath,
} from "@/lib/api";

import type {
  PageData,
  OrganizationWorkspace,
  OrganizationWorkspaceMember,
  OrganizationWorkspaceArchiveResult,
  OrganizationWorkspaceCreateInput,
  OrganizationWorkspaceSlugAvailability,
} from "@/types/api";

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

export async function listAllOrganizationWorkspaces(
  params: {
    organizationId?: string;
    q?: string;
    ordering?: string;
    archived?: boolean;
    enterableOnly?: boolean;
    pageSize?: number;
  } = {},
): Promise<OrganizationWorkspace[]> {
  const size = Math.max(1, params.pageSize ?? 100);
  let page = 1;
  const items: OrganizationWorkspace[] = [];

  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- sequential pagination: each page depends on the previous result
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
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  return api.get<PageData<OrganizationWorkspaceMember>>(
    `${organizationWorkspacePath(organizationId, workspaceId, "/members")}${query}`,
  );
}

export async function createOrganizationWorkspace(
  organizationId: string | undefined,
  payload: OrganizationWorkspaceCreateInput,
): Promise<OrganizationWorkspace> {
  return api.post<OrganizationWorkspace>(organizationWorkspacesBasePath(organizationId), payload);
}

export async function checkOrganizationWorkspaceSlugAvailability(
  organizationId: string | undefined,
  slug: string,
): Promise<OrganizationWorkspaceSlugAvailability> {
  return api.get<OrganizationWorkspaceSlugAvailability>(
    `${organizationWorkspacesBasePath(organizationId)}/slug-availability${toQueryString({ slug })}`,
  );
}

export async function archiveOrganizationWorkspace(
  organizationId: string | undefined,
  workspaceId: string,
): Promise<OrganizationWorkspaceArchiveResult> {
  return api.post<OrganizationWorkspaceArchiveResult>(
    organizationWorkspacePath(organizationId, workspaceId, "/archive"),
  );
}

export async function unarchiveOrganizationWorkspace(
  organizationId: string | undefined,
  workspaceId: string,
): Promise<OrganizationWorkspaceArchiveResult> {
  return api.post<OrganizationWorkspaceArchiveResult>(
    organizationWorkspacePath(organizationId, workspaceId, "/unarchive"),
  );
}

export async function deleteOrganizationWorkspace(
  organizationId: string | undefined,
  workspaceId: string,
  confirmName: string,
): Promise<{ workspaceId: string; deleted: boolean }> {
  const query = toQueryString({ confirmName });
  return api.delete<{ workspaceId: string; deleted: boolean }>(
    `${organizationWorkspacePath(organizationId, workspaceId)}${query}`,
  );
}
