import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  AdminContentComponentBindingList,
  AdminContentHierarchyNode,
  AdminContentItem,
  AdminContentLibraryViewsState,
  AdminContentModel,
  AdminContentModelJsonPreview,
  AdminContentModelImpactPreview,
  AdminContentRouteBinding,
  AdminContentTranslationGroup,
  AdminContentSeoProfile,
  AdminContentVersion,
  AdminPublishImpact,
  ApplyAdminContentBootstrapShapePayload,
  CreateAdminContentModelFieldPayload,
  CreateAdminContentModelPayload,
  CreateAdminContentLibraryViewPayload,
  CreateAdminContentTranslationPayload,
  CreateAdminContentItemPayload,
  ListAdminContentItemsParams,
  ListAdminContentModelsParams,
  ListAdminContentVersionsParams,
  MoveAdminContentLibraryViewPayload,
  PatchAdminContentModelFieldPayload,
  PatchAdminContentModelPayload,
  PatchAdminContentVersionPayload,
  PageData,
  PatchAdminContentItemWorkflowPayload,
  PatchAdminContentLibraryViewPayload,
  ReorderAdminContentModelFieldsPayload,
  SaveAdminContentDraftVersionPayload,
  UpsertAdminContentRouteBindingPayload,
} from "@arclayer/openapi/admin-types";

const CONTENT_LIST_PAGE_SIZE = 200;

export type BulkContentItemTransitionResult = {
  items: AdminContentVersion[];
};

export type AdminContentVersionCompareChange = {
  path: string;
  before?: unknown;
  after?: unknown;
};

export type AdminContentVersionCompare = {
  itemId: string;
  sourceVersionNumber: number;
  targetVersionNumber: number;
  changes: AdminContentVersionCompareChange[];
};

export type AdminContentModelFieldTypeDefinition = {
  uid: string;
  configKind: string;
  source: "built_in" | "plugin";
  lifecycle: "active" | "deprecated" | "disabled";
  scalar: CreateAdminContentModelFieldPayload["scalar"];
  group: "text" | "value_logic" | "time_media" | "structure" | "custom";
  labelKey?: string | null;
  descriptionKey?: string | null;
  label?: string | null;
  description?: string | null;
  icon?: string | null;
  pluginId?: string | null;
  configSchema: Record<string, unknown>;
  settingsSections: Array<"basic" | "advanced">;
  allowedModelKinds: Array<AdminContentModel["modelKind"]>;
};

export type AdminContentModelKindDefinition = {
  id: AdminContentModel["modelKind"];
  labelKey: string;
  descriptionKey: string;
  defaultEditor: CreateAdminContentModelPayload["defaultEditor"];
  defaultCapabilities: NonNullable<CreateAdminContentModelPayload["capabilities"]>;
};

export type AdminContentModelFieldTypeRegistry = {
  modelKinds: AdminContentModelKindDefinition[];
  fieldTypes: AdminContentModelFieldTypeDefinition[];
};

export function buildContentModelsQueryKey(projectId: string | null) {
  return ["content", "models", projectId] as const;
}

export function buildContentModelFieldTypesQueryKey(projectId: string | null) {
  return ["content", "models", "field-types", projectId] as const;
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
    q: params.q,
    ordering: params.ordering,
    category: params.category,
    model_kind: params.model_kind,
    system_managed: params.system_managed,
  });
  return api.get<PageData<AdminContentModel>>(projectPath(projectId, `/content/models${query}`));
}

export async function listAllContentModels(projectId: string): Promise<AdminContentModel[]> {
  return collectAllPages((page) =>
    listContentModels(projectId, { page, size: CONTENT_LIST_PAGE_SIZE }),
  );
}

export async function getContentModelFieldTypeRegistry(
  projectId: string,
): Promise<AdminContentModelFieldTypeRegistry> {
  return api.get<AdminContentModelFieldTypeRegistry>(
    projectPath(projectId, "/content/models/field-types"),
  );
}

export async function createContentModel(
  projectId: string,
  payload: CreateAdminContentModelPayload,
): Promise<AdminContentModel> {
  return api.post<AdminContentModel>(projectPath(projectId, "/content/models"), payload);
}

export async function getContentModelJsonPreview(
  projectId: string,
  modelId: string,
): Promise<AdminContentModelJsonPreview> {
  return api.get<AdminContentModelJsonPreview>(
    projectPath(projectId, `/content/models/${modelId}/json-preview`),
  );
}

export async function addContentModelField(
  projectId: string,
  modelId: string,
  payload: CreateAdminContentModelFieldPayload,
): Promise<AdminContentModel> {
  return api.post<AdminContentModel>(
    projectPath(projectId, `/content/models/${modelId}/fields`),
    payload,
  );
}

export async function updateContentModelField(
  projectId: string,
  modelId: string,
  fieldKey: string,
  payload: PatchAdminContentModelFieldPayload,
): Promise<AdminContentModel> {
  return api.patch<AdminContentModel>(
    projectPath(projectId, `/content/models/${modelId}/fields/${encodeURIComponent(fieldKey)}`),
    payload,
  );
}

export async function reorderContentModelFields(
  projectId: string,
  modelId: string,
  payload: ReorderAdminContentModelFieldsPayload,
): Promise<AdminContentModel> {
  return api.post<AdminContentModel>(
    projectPath(projectId, `/content/models/${modelId}/fields/reorder`),
    payload,
  );
}

export async function deleteContentModelField(
  projectId: string,
  modelId: string,
  fieldKey: string,
): Promise<AdminContentModel> {
  return api.delete<AdminContentModel>(
    projectPath(projectId, `/content/models/${modelId}/fields/${encodeURIComponent(fieldKey)}`),
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

export async function deleteContentModel(projectId: string, modelId: string): Promise<void> {
  await api.delete(projectPath(projectId, `/content/models/${modelId}`));
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

export async function listContentItemTranslations(
  projectId: string,
  itemId: string,
): Promise<AdminContentTranslationGroup> {
  return api.get<AdminContentTranslationGroup>(
    projectPath(projectId, `/content/items/${itemId}/translations`),
  );
}

export async function createContentItemTranslation(
  projectId: string,
  itemId: string,
  payload: CreateAdminContentTranslationPayload,
): Promise<AdminContentItem> {
  return api.post<AdminContentItem>(
    projectPath(projectId, `/content/items/${itemId}/translations`),
    payload,
  );
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

export async function upsertContentRouteBinding(
  projectId: string,
  itemId: string,
  payload: UpsertAdminContentRouteBindingPayload,
): Promise<AdminContentRouteBinding> {
  return api.put<AdminContentRouteBinding>(
    projectPath(projectId, `/content/routing/bindings/${itemId}`),
    payload,
  );
}

export async function listContentRouteBindings(
  projectId: string,
): Promise<AdminContentRouteBinding[]> {
  return api.get<AdminContentRouteBinding[]>(projectPath(projectId, "/content/routing/bindings"));
}

export async function listContentHierarchyNodes(
  projectId: string,
): Promise<AdminContentHierarchyNode[]> {
  return api.get<AdminContentHierarchyNode[]>(projectPath(projectId, "/content/routing/hierarchy"));
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

export async function listContentVersionComponentBindings(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentComponentBindingList> {
  return api.get<AdminContentComponentBindingList>(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}/bindings`),
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

export async function bulkPublishContentItems(
  projectId: string,
  itemIds: string[],
): Promise<BulkContentItemTransitionResult> {
  return api.post<BulkContentItemTransitionResult>(
    projectPath(projectId, "/content/items/bulk/publish"),
    { itemIds },
  );
}

export async function bulkUnpublishContentItems(
  projectId: string,
  itemIds: string[],
): Promise<BulkContentItemTransitionResult> {
  return api.post<BulkContentItemTransitionResult>(
    projectPath(projectId, "/content/items/bulk/unpublish"),
    { itemIds },
  );
}

export async function compareContentItemVersions(
  projectId: string,
  itemId: string,
  sourceVersionNumber: number,
  targetVersionNumber: number,
): Promise<AdminContentVersionCompare> {
  return api.get<AdminContentVersionCompare>(
    projectPath(
      projectId,
      `/content/items/${itemId}/versions/${sourceVersionNumber}/compare/${targetVersionNumber}`,
    ),
  );
}

export async function restoreContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return api.post<AdminContentVersion>(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}/restore`),
    {},
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
