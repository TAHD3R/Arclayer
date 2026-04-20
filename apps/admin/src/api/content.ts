import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminContentItem,
  AdminContentLibraryViewsState,
  AdminContentModel,
  AdminContentModelImpactPreview,
  AdminContentSeoProfile,
  AdminContentVersion,
  AdminRelease,
  AdminReleaseDryRun,
  AdminReleaseList,
  AdminReleasePublishResult,
  AdminReleaseRollbackResult,
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
  PatchAdminContentItemWorkflowPayload,
  PatchAdminContentLibraryViewPayload,
  SaveAdminContentDraftVersionPayload,
} from "@/types/api";

const CONTENT_LIST_PAGE_SIZE = 200;

export function buildContentModelsGovernanceQueryKey(projectId: string | null) {
  return ["content", "models", "governance", projectId] as const;
}

export function buildContentModelPreviewQueryKey(
  projectId: string | null,
  modelId: string | null,
  payloadKey: string | null,
) {
  return ["content", "models", "preview", projectId, modelId, payloadKey] as const;
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
  projectId: string,
  params: ListAdminContentModelsParams = {},
): Promise<PageData<AdminContentModel>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? CONTENT_LIST_PAGE_SIZE,
  });
  return api.get<PageData<AdminContentModel>>(projectPath(projectId, `/content/models${query}`));
}

export async function listAllContentModels(projectId: string): Promise<AdminContentModel[]> {
  return collectAllPages((page) =>
    listContentModels(projectId, { page, size: CONTENT_LIST_PAGE_SIZE }),
  );
}

export async function getContentModelImpactPreview(
  projectId: string,
  modelId: string,
  payload: PatchAdminContentModelPayload,
): Promise<AdminContentModelImpactPreview> {
  return api.post<AdminContentModelImpactPreview>(
    projectPath(projectId, `/content/models/${modelId}/impact-preview`),
    payload,
  );
}

export async function patchContentModel(
  projectId: string,
  modelId: string,
  payload: PatchAdminContentModelPayload,
): Promise<AdminContentModel> {
  return api.patch<AdminContentModel>(
    projectPath(projectId, `/content/models/${modelId}`),
    payload,
  );
}

export async function listContentItems(
  projectId: string,
  params: ListAdminContentItemsParams = {},
): Promise<PageData<AdminContentItem>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? CONTENT_LIST_PAGE_SIZE,
    modelKey: params.modelKey,
  });
  return api.get<PageData<AdminContentItem>>(projectPath(projectId, `/content/items${query}`));
}

export async function listAllContentItems(projectId: string): Promise<AdminContentItem[]> {
  return collectAllPages((page) =>
    listContentItems(projectId, { page, size: CONTENT_LIST_PAGE_SIZE }),
  );
}

export async function getContentItem(projectId: string, itemId: string): Promise<AdminContentItem> {
  return api.get<AdminContentItem>(projectPath(projectId, `/content/items/${itemId}`));
}

export async function createContentItem(
  projectId: string,
  payload: CreateAdminContentItemPayload,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(projectPath(projectId, "/content/items"), payload);
}

export async function applyContentBootstrapShape(
  projectId: string,
  itemId: string,
  payload: ApplyAdminContentBootstrapShapePayload,
): Promise<AdminContentItem> {
  return api.patch<AdminContentItem>(
    projectPath(projectId, `/content/items/${itemId}/bootstrap-shape`),
    payload,
  );
}

export async function archiveContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return api.post<AdminContentVersion>(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}/archive`),
  );
}

export async function saveContentItemDraftVersion(
  projectId: string,
  itemId: string,
  payload: SaveAdminContentDraftVersionPayload,
): Promise<AdminContentVersion> {
  return api.post<AdminContentVersion>(
    projectPath(projectId, `/content/items/${itemId}/versions/draft`),
    payload,
  );
}

export async function getContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return api.get<AdminContentVersion>(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}`),
  );
}

export async function listContentItemVersions(
  projectId: string,
  itemId: string,
  params: ListAdminContentVersionsParams = {},
): Promise<PageData<AdminContentVersion>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
  });
  return api.get<PageData<AdminContentVersion>>(
    projectPath(projectId, `/content/items/${itemId}/versions${query}`),
  );
}

export async function patchContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
  payload: PatchAdminContentVersionPayload,
): Promise<AdminContentVersion> {
  return api.patch<AdminContentVersion>(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}`),
    payload,
  );
}

export async function publishContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return api.post<AdminContentVersion>(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}/publish`),
  );
}

export async function getContentSeoProfile(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentSeoProfile> {
  return api.get<AdminContentSeoProfile>(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}/seo`),
  );
}

export async function getProjectPublishImpact(projectId: string): Promise<AdminPublishImpact> {
  return api.get<AdminPublishImpact>(projectPath(projectId, "/publish/impact"));
}

export async function patchContentItemWorkflow(
  projectId: string,
  itemId: string,
  payload: PatchAdminContentItemWorkflowPayload,
): Promise<AdminContentItem> {
  return api.patch<AdminContentItem>(
    projectPath(projectId, `/content/items/${itemId}/workflow`),
    payload,
  );
}

export async function listProjectReleases(projectId: string): Promise<AdminReleaseList> {
  return api.get<AdminReleaseList>(projectPath(projectId, "/releases"));
}

export async function getProjectReleaseDryRun(projectId: string): Promise<AdminReleaseDryRun> {
  return api.get<AdminReleaseDryRun>(projectPath(projectId, "/releases/dry-run"));
}

export async function publishProjectRelease(projectId: string): Promise<AdminReleasePublishResult> {
  return api.post<AdminReleasePublishResult>(projectPath(projectId, "/releases/publish"));
}

export async function rollbackProjectRelease(
  projectId: string,
  releaseId: string,
): Promise<AdminReleaseRollbackResult> {
  return api.post<AdminReleaseRollbackResult>(
    projectPath(projectId, `/releases/${releaseId}/rollback`),
  );
}

export async function getProjectRelease(
  projectId: string,
  releaseId: string,
): Promise<AdminRelease> {
  return api.get<AdminRelease>(projectPath(projectId, `/releases/${releaseId}`));
}

export async function getContentLibraryViews(
  projectId: string,
): Promise<AdminContentLibraryViewsState> {
  return api.get<AdminContentLibraryViewsState>(projectPath(projectId, "/content/library/views"));
}

export async function createContentLibraryView(
  projectId: string,
  payload: CreateAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return api.post<AdminContentLibraryViewsState>(
    projectPath(projectId, "/content/library/views"),
    payload,
  );
}

export async function updateContentLibraryView(
  projectId: string,
  viewId: string,
  payload: PatchAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return api.patch<AdminContentLibraryViewsState>(
    projectPath(projectId, `/content/library/views/${viewId}`),
    payload,
  );
}

export async function moveContentLibraryView(
  projectId: string,
  viewId: string,
  payload: MoveAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return api.post<AdminContentLibraryViewsState>(
    projectPath(projectId, `/content/library/views/${viewId}/move`),
    payload,
  );
}

export async function deleteContentLibraryView(
  projectId: string,
  viewId: string,
): Promise<AdminContentLibraryViewsState> {
  return api.delete<AdminContentLibraryViewsState>(
    projectPath(projectId, `/content/library/views/${viewId}`),
  );
}

export async function archiveContentItem(
  projectId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(projectPath(projectId, `/content/items/${itemId}/archive`));
}

export async function unarchiveContentItem(
  projectId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(projectPath(projectId, `/content/items/${itemId}/unarchive`));
}

export async function duplicateContentItem(
  projectId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(projectPath(projectId, `/content/items/${itemId}/duplicate`));
}

export async function deleteContentItem(projectId: string, itemId: string): Promise<void> {
  await api.delete<void>(projectPath(projectId, `/content/items/${itemId}`));
}
