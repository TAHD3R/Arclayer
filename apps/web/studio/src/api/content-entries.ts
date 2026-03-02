import { api } from "@/lib/http";
import type { PageData } from "@/types/api";
import type {
  ContentEntryOut,
  ContentEntryRevisionOut,
  ContentEntryRevisionState,
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
  return api.get<PageData<ContentEntryOut>>(`/workspaces/${workspaceId}/content/entries${query}`);
}

export async function getWorkspaceContentEntryRevision(
  workspaceId: string,
  entryId: string,
  state: ContentEntryRevisionState,
): Promise<ContentEntryRevisionOut> {
  return api.get<ContentEntryRevisionOut>(
    `/workspaces/${workspaceId}/content/entries/${encodeURIComponent(entryId)}/revisions/${encodeURIComponent(state)}`,
  );
}
