import type {
  ContentViewCreateIn,
  ContentViewOut,
  ContentViewPreviewIn,
  ContentViewPreviewOut,
} from "@celestial/api-client";

import { toQueryString, workspacePath } from "@/lib/api";
import { api } from "@/lib/http";
import type { PageData } from "@/types/api";

export type {
  ContentViewCreateIn,
  ContentViewOut,
  ContentViewPreviewIn,
  ContentViewPreviewOut,
} from "@celestial/api-client";

export async function listWorkspaceContentViews(
  workspaceId: string,
  params?: { page?: number; size?: number },
): Promise<PageData<ContentViewOut>> {
  const query = toQueryString({ page: params?.page, size: params?.size });
  return api.get<PageData<ContentViewOut>>(workspacePath(workspaceId, `/content/views${query}`));
}

export async function createWorkspaceContentView(
  workspaceId: string,
  payload: ContentViewCreateIn,
): Promise<ContentViewOut> {
  return api.post<ContentViewOut>(workspacePath(workspaceId, "/content/views"), payload);
}

export async function previewWorkspaceContentView(
  workspaceId: string,
  viewId: string,
  payload: ContentViewPreviewIn,
): Promise<ContentViewPreviewOut> {
  return api.post<ContentViewPreviewOut>(
    workspacePath(workspaceId, `/content/views/${encodeURIComponent(viewId)}/preview`),
    payload,
  );
}
