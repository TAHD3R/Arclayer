import { api } from "@/lib/http";
import type { PageData } from "@/types/api";
import type { ContentTypeOut } from "@/types/api/content-types";

export async function listWorkspaceContentTypes(
  workspaceId: string,
  params?: { page?: number; size?: number },
): Promise<PageData<ContentTypeOut>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return api.get<PageData<ContentTypeOut>>(`/workspaces/${workspaceId}/content/types${query}`);
}
