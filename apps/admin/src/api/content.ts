import { workspacePath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminContentItem,
  AdminContentModel,
  AdminContentVersion,
  ApplyAdminContentBootstrapShapePayload,
  CreateAdminContentItemPayload,
  ListAdminContentItemsParams,
  ListAdminContentModelsParams,
  PageData,
} from "@/types/api";

const CONTENT_LIST_PAGE_SIZE = 200;

async function collectAllPages<T>(fetchPage: (page: number) => Promise<PageData<T>>): Promise<T[]> {
  const firstPage = await fetchPage(1);
  const totalPages = Math.max(firstPage.pages ?? 0, 1);
  if (totalPages === 1) return firstPage.items ?? [];

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2)),
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.items ?? []);
}

export async function listContentModels(
  workspaceId: string,
  params: ListAdminContentModelsParams = {},
): Promise<PageData<AdminContentModel>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? CONTENT_LIST_PAGE_SIZE,
  });
  return api.get<PageData<AdminContentModel>>(
    workspacePath(workspaceId, `/content/models${query}`),
  );
}

export async function listAllContentModels(workspaceId: string): Promise<AdminContentModel[]> {
  return collectAllPages((page) =>
    listContentModels(workspaceId, { page, size: CONTENT_LIST_PAGE_SIZE }),
  );
}

export async function listContentItems(
  workspaceId: string,
  params: ListAdminContentItemsParams = {},
): Promise<PageData<AdminContentItem>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? CONTENT_LIST_PAGE_SIZE,
    modelKey: params.modelKey,
  });
  return api.get<PageData<AdminContentItem>>(workspacePath(workspaceId, `/content/items${query}`));
}

export async function listAllContentItems(workspaceId: string): Promise<AdminContentItem[]> {
  return collectAllPages((page) =>
    listContentItems(workspaceId, { page, size: CONTENT_LIST_PAGE_SIZE }),
  );
}

export async function createContentItem(
  workspaceId: string,
  payload: CreateAdminContentItemPayload,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(workspacePath(workspaceId, "/content/items"), payload);
}

export async function applyContentBootstrapShape(
  workspaceId: string,
  itemId: string,
  payload: ApplyAdminContentBootstrapShapePayload,
): Promise<AdminContentItem> {
  return api.patch<AdminContentItem>(
    workspacePath(workspaceId, `/content/items/${itemId}/bootstrap-shape`),
    payload,
  );
}

export async function archiveContentItemVersion(
  workspaceId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return api.post<AdminContentVersion>(
    workspacePath(workspaceId, `/content/items/${itemId}/versions/${versionNumber}/archive`),
  );
}

export async function archiveContentItem(
  workspaceId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(workspacePath(workspaceId, `/content/items/${itemId}/archive`));
}

export async function unarchiveContentItem(
  workspaceId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(
    workspacePath(workspaceId, `/content/items/${itemId}/unarchive`),
  );
}

export async function duplicateContentItem(
  workspaceId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(
    workspacePath(workspaceId, `/content/items/${itemId}/duplicate`),
  );
}

export async function deleteContentItem(workspaceId: string, itemId: string): Promise<void> {
  await api.delete<void>(workspacePath(workspaceId, `/content/items/${itemId}`));
}
