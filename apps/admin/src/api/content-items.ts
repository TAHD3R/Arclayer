import { api } from "@/lib/http";
import type { ContentItemOut, ContentVersionOut } from "@celestial/api-client";
import type { PageData } from "@/types/api";

export type { ContentItemOut, ContentVersionOut } from "@celestial/api-client";

export type CreateContentItemInput = {
  modelKey: string;
  slug: string;
  title?: string | null;
  locale?: string;
  status?: "draft" | "published" | "scheduled" | "archived";
  visibility?: "public" | "private" | "internal";
};

export async function listWorkspaceContentItems(
  workspaceId: string,
  params?: { page?: number; size?: number; modelKey?: string },
): Promise<PageData<ContentItemOut>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  if (params?.modelKey) qs.set("modelKey", params.modelKey);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return api.get<PageData<ContentItemOut>>(`/workspaces/${workspaceId}/content/items${query}`);
}

export async function createWorkspaceContentItem(
  workspaceId: string,
  input: CreateContentItemInput,
): Promise<ContentItemOut> {
  return api.post<ContentItemOut>(`/workspaces/${workspaceId}/content/items`, {
    modelKey: input.modelKey,
    slug: input.slug,
    title: input.title ?? null,
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.visibility ? { visibility: input.visibility } : {}),
  });
}

export async function publishWorkspaceContentItemVersion(
  workspaceId: string,
  itemId: string,
  versionNumber: number,
): Promise<ContentVersionOut> {
  return api.post<ContentVersionOut>(
    `/workspaces/${workspaceId}/content/items/${itemId}/versions/${versionNumber}/publish`,
    {},
  );
}

export async function archiveWorkspaceContentItemVersion(
  workspaceId: string,
  itemId: string,
  versionNumber: number,
): Promise<ContentVersionOut> {
  return api.post<ContentVersionOut>(
    `/workspaces/${workspaceId}/content/items/${itemId}/versions/${versionNumber}/archive`,
    {},
  );
}
