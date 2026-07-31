import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type {
  PageData,
  WorkspaceManageArchiveResult,
  WorkspaceManageCreateInput,
  WorkspaceManageListItem,
  WorkspaceManageMember,
} from "@arclayer/openapi/admin-types";

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

export async function listWorkspaces(params: {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
  archived?: boolean;
  enterableOnly?: boolean;
}): Promise<PageData<WorkspaceManageListItem>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    ordering: params.ordering,
    archived: params.archived,
    enterable_only: params.enterableOnly,
  });
  return api.get<PageData<WorkspaceManageListItem>>(`/workspaces${query}`);
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
    enterableOnly: params.enterableOnly,
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
): Promise<PageData<WorkspaceManageMember>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 10,
    q: params.q,
  });
  return api.get<PageData<WorkspaceManageMember>>(
    `${workspacePath(workspaceId, "/team/members")}${query}`,
  );
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
