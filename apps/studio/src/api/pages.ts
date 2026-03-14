import { api } from "@/lib/http";
import type {
  ContentPageDraftSaveOut,
  ContentPageDraftSavePayload,
  ContentPagePublishOut,
  ContentPagePublishPayload,
  ContentPageRevisionOut,
  ContentPageUnpublishOut,
  PageTreeResult,
  WorkspacePageCreateIn,
  WorkspacePageDeleteOut,
  WorkspacePageMoveIn,
  WorkspacePageUpdateIn,
  WorkspacePageTreeNode,
} from "@/types/api";

export async function listWorkspacePagesTree(
  workspaceId: string,
): Promise<PageTreeResult<WorkspacePageTreeNode>> {
  return api.get<PageTreeResult<WorkspacePageTreeNode>>(
    `/workspaces/${workspaceId}/legacy-content/pages/tree`,
  );
}

export async function createWorkspacePage(
  workspaceId: string,
  payload: WorkspacePageCreateIn,
): Promise<WorkspacePageTreeNode> {
  return api.post<WorkspacePageTreeNode>(
    `/workspaces/${workspaceId}/legacy-content/pages`,
    payload,
  );
}

export async function getWorkspacePage(
  workspaceId: string,
  pageId: string,
): Promise<WorkspacePageTreeNode> {
  return api.get<WorkspacePageTreeNode>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}`,
  );
}

export async function updateWorkspacePage(
  workspaceId: string,
  pageId: string,
  payload: WorkspacePageUpdateIn,
): Promise<WorkspacePageTreeNode> {
  return api.patch<WorkspacePageTreeNode>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}`,
    payload,
  );
}

export async function moveWorkspacePage(
  workspaceId: string,
  pageId: string,
  payload: WorkspacePageMoveIn,
): Promise<WorkspacePageTreeNode> {
  return api.post<WorkspacePageTreeNode>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}/move`,
    payload,
  );
}

export async function deleteWorkspacePage(
  workspaceId: string,
  pageId: string,
): Promise<WorkspacePageDeleteOut> {
  return api.delete<WorkspacePageDeleteOut>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}`,
  );
}

export async function getWorkspacePageDraftRevision(
  workspaceId: string,
  pageId: string,
): Promise<ContentPageRevisionOut> {
  return api.get<ContentPageRevisionOut>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/draft`,
  );
}

export async function getWorkspacePagePublishedRevision(
  workspaceId: string,
  pageId: string,
): Promise<ContentPageRevisionOut> {
  return api.get<ContentPageRevisionOut>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/published`,
  );
}

export async function saveWorkspacePageDraftRevision(
  workspaceId: string,
  pageId: string,
  payload: ContentPageDraftSavePayload,
): Promise<ContentPageDraftSaveOut> {
  return api.post<ContentPageDraftSaveOut>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/draft`,
    payload,
  );
}

export async function publishWorkspacePageRevision(
  workspaceId: string,
  pageId: string,
  payload: ContentPagePublishPayload = {},
): Promise<ContentPagePublishOut> {
  return api.post<ContentPagePublishOut>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/publish`,
    payload,
  );
}

export async function unpublishWorkspacePage(
  workspaceId: string,
  pageId: string,
): Promise<ContentPageUnpublishOut> {
  return api.post<ContentPageUnpublishOut>(
    `/workspaces/${workspaceId}/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/unpublish`,
    {},
  );
}
