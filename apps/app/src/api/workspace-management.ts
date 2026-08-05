import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type {
  WorkspaceManageArchiveResult,
  WorkspaceManageCreateRequest as WorkspaceManageCreateInput,
  WorkspaceManageListItemOut as WorkspaceManageListItem,
  PageDataWorkspaceManageListItemOut,
  PageDataWorkspaceTeamMemberOut,
  DomainWorkspacesListWorkspacesData,
} from "@arclayer/openapi";

type ListWorkspacesParams = NonNullable<DomainWorkspacesListWorkspacesData["query"]>;

type WorkspacePage = PageDataWorkspaceManageListItemOut | PageDataWorkspaceTeamMemberOut;
type RequiredWorkspacePage<TPage extends WorkspacePage> = Omit<TPage, "items"> & {
  items: NonNullable<TPage["items"]>;
};

function requireWorkspacePage<TPage extends WorkspacePage>(
  page: TPage,
): RequiredWorkspacePage<TPage> {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid workspace pagination response");
  }
  return { ...page, items: page.items };
}

type AccessRestrictionReasonCategory =
  | "policy_violation"
  | "security_risk"
  | "billing_issue"
  | "abuse_prevention"
  | "compliance_review"
  | "owner_request"
  | "other";

type AccessRestrictionEnforcePayload = {
  expectedRevision: number;
  reasonCategory: AccessRestrictionReasonCategory;
  reasonCode: string;
  operatorNote: string;
  reviewAt?: string | null;
  expiresAt?: string | null;
};

type AccessRestrictionLiftPayload = {
  expectedRevision: number;
  operatorNote: string;
};

export async function listWorkspaces(
  params: ListWorkspacesParams,
): Promise<RequiredWorkspacePage<PageDataWorkspaceManageListItemOut>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    ordering: params.ordering,
    archived: params.archived,
    enterable_only: params.enterable_only,
  });
  const page = await api.get<PageDataWorkspaceManageListItemOut>(`/workspaces${query}`);
  return requireWorkspacePage(page);
}

export async function listAllWorkspaces(
  params: {
    q?: string;
    ordering?: string;
    archived?: boolean;
    enterableOnly?: boolean;
    pageSize?: number;
  } = {},
): Promise<WorkspaceManageListItem[]> {
  const size = Math.max(1, params.pageSize ?? 100);
  return collectWorkspacesPage(params, 1, size, []);
}

async function collectWorkspacesPage(
  params: {
    q?: string;
    ordering?: string;
    archived?: boolean;
    enterableOnly?: boolean;
  },
  page: number,
  size: number,
  items: WorkspaceManageListItem[],
): Promise<WorkspaceManageListItem[]> {
  const result = await listWorkspaces({
    page,
    size,
    q: params.q,
    ordering: params.ordering,
    archived: params.archived,
    enterable_only: params.enterableOnly,
  });

  items.push(...result.items);

  if (!result.next || result.page >= result.pages) {
    return items;
  }

  return collectWorkspacesPage(params, result.next, size, items);
}

export async function listWorkspaceMembers(
  workspaceId: string,
  params: {
    page?: number;
    size?: number;
    q?: string;
  },
): Promise<RequiredWorkspacePage<PageDataWorkspaceTeamMemberOut>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  const page = await api.get<PageDataWorkspaceTeamMemberOut>(
    `${workspacePath(workspaceId, "/team/members")}${query}`,
  );
  return requireWorkspacePage(page);
}

export async function createWorkspace(
  payload: WorkspaceManageCreateInput,
): Promise<WorkspaceManageListItem> {
  return api.post<WorkspaceManageListItem>("/workspaces", payload);
}

export async function archiveWorkspace(
  workspaceId: string,
  payload: AccessRestrictionEnforcePayload,
  idempotencyKey: string,
): Promise<WorkspaceManageArchiveResult> {
  return api.post<WorkspaceManageArchiveResult>(workspacePath(workspaceId, "/archive"), payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function unarchiveWorkspace(
  workspaceId: string,
  payload: AccessRestrictionLiftPayload,
  idempotencyKey: string,
): Promise<WorkspaceManageArchiveResult> {
  return api.post<WorkspaceManageArchiveResult>(workspacePath(workspaceId, "/unarchive"), payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function deleteWorkspace(
  workspaceId: string,
  confirmName: string,
): Promise<{ workspaceId: string; deleted: boolean }> {
  return api.delete<{ workspaceId: string; deleted: boolean }>(
    `${workspacePath(workspaceId, "")}${toQueryString({ confirmName })}`,
  );
}
