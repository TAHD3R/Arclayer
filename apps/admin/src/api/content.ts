import { workspacePath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminContentItem,
  AdminContentLibraryViewsState,
  AdminContentModel,
  AdminContentModelImpactPreview,
  AdminContentSeoProfile,
  AdminContentVersion,
  AdminPublishImpact,
  ApplyAdminContentBootstrapShapePayload,
  CreateAdminContentLibraryViewPayload,
  CreateAdminContentItemPayload,
  ListAdminContentItemsParams,
  ListAdminContentModelsParams,
  ListAdminContentVersionsParams,
  MoveAdminContentLibraryViewPayload,
  PatchAdminContentModelPayload,
  PatchAdminContentVersionPayload,
  PageData,
  PatchAdminContentLibraryViewPayload,
  SaveAdminContentDraftVersionPayload,
} from "@/types/api";

const CONTENT_LIST_PAGE_SIZE = 200;

export function buildContentModelsGovernanceQueryKey(workspaceId: string | null) {
  return ["content", "models", "governance", workspaceId] as const;
}

export function buildContentModelPreviewQueryKey(
  workspaceId: string | null,
  modelId: string | null,
  payloadKey: string | null,
) {
  return ["content", "models", "preview", workspaceId, modelId, payloadKey] as const;
}

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

export async function getContentModelImpactPreview(
  workspaceId: string,
  modelId: string,
  payload: PatchAdminContentModelPayload,
): Promise<AdminContentModelImpactPreview> {
  return api.post<AdminContentModelImpactPreview>(
    workspacePath(workspaceId, `/content/models/${modelId}/impact-preview`),
    payload,
  );
}

export async function patchContentModel(
  workspaceId: string,
  modelId: string,
  payload: PatchAdminContentModelPayload,
): Promise<AdminContentModel> {
  return api.patch<AdminContentModel>(
    workspacePath(workspaceId, `/content/models/${modelId}`),
    payload,
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

export async function getContentItem(
  workspaceId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return api.get<AdminContentItem>(workspacePath(workspaceId, `/content/items/${itemId}`));
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

export async function saveContentItemDraftVersion(
  workspaceId: string,
  itemId: string,
  payload: SaveAdminContentDraftVersionPayload,
): Promise<AdminContentVersion> {
  return api.post<AdminContentVersion>(
    workspacePath(workspaceId, `/content/items/${itemId}/versions/draft`),
    payload,
  );
}

export async function getContentItemVersion(
  workspaceId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return api.get<AdminContentVersion>(
    workspacePath(workspaceId, `/content/items/${itemId}/versions/${versionNumber}`),
  );
}

export async function listContentItemVersions(
  workspaceId: string,
  itemId: string,
  params: ListAdminContentVersionsParams = {},
): Promise<PageData<AdminContentVersion>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
  });
  return api.get<PageData<AdminContentVersion>>(
    workspacePath(workspaceId, `/content/items/${itemId}/versions${query}`),
  );
}

export async function patchContentItemVersion(
  workspaceId: string,
  itemId: string,
  versionNumber: number,
  payload: PatchAdminContentVersionPayload,
): Promise<AdminContentVersion> {
  return api.patch<AdminContentVersion>(
    workspacePath(workspaceId, `/content/items/${itemId}/versions/${versionNumber}`),
    payload,
  );
}

export async function publishContentItemVersion(
  workspaceId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return api.post<AdminContentVersion>(
    workspacePath(workspaceId, `/content/items/${itemId}/versions/${versionNumber}/publish`),
  );
}

export async function getContentSeoProfile(
  workspaceId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentSeoProfile> {
  return api.get<AdminContentSeoProfile>(
    workspacePath(workspaceId, `/content/items/${itemId}/versions/${versionNumber}/seo`),
  );
}

export async function getWorkspacePublishImpact(workspaceId: string): Promise<AdminPublishImpact> {
  return api.get<AdminPublishImpact>(workspacePath(workspaceId, "/publish/impact"));
}

export async function getContentLibraryViews(
  workspaceId: string,
): Promise<AdminContentLibraryViewsState> {
  return api.get<AdminContentLibraryViewsState>(
    workspacePath(workspaceId, "/content/library/views"),
  );
}

export async function createContentLibraryView(
  workspaceId: string,
  payload: CreateAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return api.post<AdminContentLibraryViewsState>(
    workspacePath(workspaceId, "/content/library/views"),
    payload,
  );
}

export async function updateContentLibraryView(
  workspaceId: string,
  viewId: string,
  payload: PatchAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return api.patch<AdminContentLibraryViewsState>(
    workspacePath(workspaceId, `/content/library/views/${viewId}`),
    payload,
  );
}

export async function moveContentLibraryView(
  workspaceId: string,
  viewId: string,
  payload: MoveAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return api.post<AdminContentLibraryViewsState>(
    workspacePath(workspaceId, `/content/library/views/${viewId}/move`),
    payload,
  );
}

export async function deleteContentLibraryView(
  workspaceId: string,
  viewId: string,
): Promise<AdminContentLibraryViewsState> {
  return api.delete<AdminContentLibraryViewsState>(
    workspacePath(workspaceId, `/content/library/views/${viewId}`),
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
