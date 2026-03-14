import { api } from "@/lib/http";
import type { PageData } from "@/types/api";
import type {
  ContentEntryCreateIn,
  ContentEntryDraftSaveIn,
  ContentEntryDraftSaveOut,
  ContentEntryOut,
  ContentEntryPublishIn,
  ContentEntryPublishOut,
  ContentEntryRevisionOut,
  ContentEntryRevisionState,
  ContentEntryUnpublishOut,
} from "@/types/api/content-entries";

export async function listWorkspaceContentEntries(
  workspaceId: string,
  params?: { page?: number; size?: number; typeCode?: string },
): Promise<PageData<ContentEntryOut>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  if (params?.typeCode) qs.set("typeCode", String(params.typeCode));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return api.get<PageData<ContentEntryOut>>(
    `/workspaces/${workspaceId}/legacy-content/entries${query}`,
  );
}

export async function createWorkspaceContentEntry(
  workspaceId: string,
  payload: ContentEntryCreateIn,
): Promise<ContentEntryOut> {
  return api.post<ContentEntryOut>(`/workspaces/${workspaceId}/legacy-content/entries`, payload);
}

export async function getWorkspaceContentEntry(
  workspaceId: string,
  entryId: string,
): Promise<ContentEntryOut> {
  return api.get<ContentEntryOut>(
    `/workspaces/${workspaceId}/legacy-content/entries/${encodeURIComponent(entryId)}`,
  );
}

export async function getWorkspaceContentEntryRevision(
  workspaceId: string,
  entryId: string,
  state: ContentEntryRevisionState,
): Promise<ContentEntryRevisionOut> {
  return api.get<ContentEntryRevisionOut>(
    `/workspaces/${workspaceId}/legacy-content/entries/${encodeURIComponent(entryId)}/revisions/${encodeURIComponent(state)}`,
  );
}

export async function saveWorkspaceContentEntryDraft(
  workspaceId: string,
  entryId: string,
  payload: ContentEntryDraftSaveIn,
): Promise<ContentEntryDraftSaveOut> {
  return api.post<ContentEntryDraftSaveOut>(
    `/workspaces/${workspaceId}/legacy-content/entries/${encodeURIComponent(entryId)}/draft`,
    payload,
  );
}

export async function publishWorkspaceContentEntry(
  workspaceId: string,
  entryId: string,
  payload: ContentEntryPublishIn = {},
): Promise<ContentEntryPublishOut> {
  return api.post<ContentEntryPublishOut>(
    `/workspaces/${workspaceId}/legacy-content/entries/${encodeURIComponent(entryId)}/publish`,
    payload,
  );
}

export async function unpublishWorkspaceContentEntry(
  workspaceId: string,
  entryId: string,
): Promise<ContentEntryUnpublishOut> {
  return api.post<ContentEntryUnpublishOut>(
    `/workspaces/${workspaceId}/legacy-content/entries/${encodeURIComponent(entryId)}/unpublish`,
    {},
  );
}
