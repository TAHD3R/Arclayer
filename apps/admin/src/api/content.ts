import { projectPath, toQueryString } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  ContentComponentBindingListOut as AdminContentComponentBindingList,
  HierarchyNodeOut as AdminContentHierarchyNode,
  ContentItemOut,
  ContentLibraryViewFiltersSchema,
  ContentLibraryViewOut,
  ContentLibraryViewSortingItemSchema,
  ContentLibraryViewsStateOut,
  ContentModelOut,
  ContentModelSchemaSnapshotOut as AdminContentModelJsonPreview,
  ContentModelImpactPreviewOut as AdminContentModelImpactPreview,
  RouteBindingOut as AdminContentRouteBinding,
  ContentTranslationGroupOut as AdminContentTranslationGroup,
  ContentSeoProfileOut as AdminContentSeoProfile,
  ContentVersionOut,
  PublishReadinessOut as AdminPublishImpact,
  ContentItemBootstrapShapeIn as ApplyAdminContentBootstrapShapePayload,
  ContentModelFieldContract as CreateAdminContentModelFieldPayload,
  ContentModelDefinitionContract as CreateAdminContentModelPayload,
  ContentLibraryViewCreateIn as CreateAdminContentLibraryViewPayload,
  ContentTranslationCreateIn as CreateAdminContentTranslationPayload,
  ContentItemCreateIn as CreateAdminContentItemPayload,
  DomainProjectsListProjectContentItemsData,
  DomainProjectsListProjectContentModelsData,
  DomainProjectsListProjectContentItemVersionsData,
  ContentLibraryViewMoveIn as MoveAdminContentLibraryViewPayload,
  ContentModelFieldPatchContract as PatchAdminContentModelFieldPayload,
  ContentModelDefinitionPatchContract as PatchAdminContentModelPayload,
  ContentVersionPatchIn as PatchAdminContentVersionPayload,
  ContentItemWorkflowPatchIn as PatchAdminContentItemWorkflowPayload,
  ContentLibraryViewPatchIn as PatchAdminContentLibraryViewPayload,
  ContentModelFieldReorderContract as ReorderAdminContentModelFieldsPayload,
  ContentVersionDraftSaveIn as SaveAdminContentDraftVersionPayload,
  RouteBindingUpsertIn as UpsertAdminContentRouteBindingPayload,
  PageDataContentModelOut,
  PageDataContentItemOut,
  PageDataContentVersionOut,
} from "@arclayer/openapi";

const CONTENT_LIST_PAGE_SIZE = 200;

type ListAdminContentItemsParams = NonNullable<DomainProjectsListProjectContentItemsData["query"]>;
type ListAdminContentModelsParams = NonNullable<
  DomainProjectsListProjectContentModelsData["query"]
>;
type ListAdminContentVersionsParams = NonNullable<
  DomainProjectsListProjectContentItemVersionsData["query"]
>;
type AdminContentModel = Omit<ContentModelOut, "capabilities"> & {
  capabilities: NonNullable<ContentModelOut["capabilities"]>;
};
type AdminContentItem = Omit<
  ContentItemOut,
  "capabilityPackIds" | "derivedStatus" | "draftVersion"
> & {
  capabilityPackIds: NonNullable<ContentItemOut["capabilityPackIds"]>;
  derivedStatus: NonNullable<ContentItemOut["derivedStatus"]>;
  draftVersion: NonNullable<ContentItemOut["draftVersion"]>;
};
type AdminContentVersion = Omit<ContentVersionOut, "fieldsSnapshot" | "presentations"> & {
  fieldsSnapshot: NonNullable<ContentVersionOut["fieldsSnapshot"]>;
  presentations: NonNullable<ContentVersionOut["presentations"]>;
};
type AdminContentLibraryViewFilters = {
  [K in keyof ContentLibraryViewFiltersSchema]?: Exclude<
    ContentLibraryViewFiltersSchema[K],
    null | undefined
  >;
};
type AdminContentLibraryViewSorting = Omit<ContentLibraryViewSortingItemSchema, "desc"> & {
  desc: boolean;
};
type AdminContentLibraryView = Omit<ContentLibraryViewOut, "filters" | "sorting"> & {
  filters: AdminContentLibraryViewFilters;
  sorting: AdminContentLibraryViewSorting[];
};
type AdminContentLibraryViewsState = Omit<ContentLibraryViewsStateOut, "items"> & {
  items: AdminContentLibraryView[];
};
type ContentModelPage = Omit<PageDataContentModelOut, "items"> & {
  items: AdminContentModel[];
};
type ContentItemPage = Omit<PageDataContentItemOut, "items"> & {
  items: AdminContentItem[];
};
type ContentVersionPage = Omit<PageDataContentVersionOut, "items"> & {
  items: AdminContentVersion[];
};

function requireContentModel(model: ContentModelOut): AdminContentModel {
  if (!Array.isArray(model.capabilities)) {
    throw new Error("Invalid content model response");
  }
  return { ...model, capabilities: model.capabilities };
}

function requireContentItem(item: ContentItemOut): AdminContentItem {
  if (
    !Array.isArray(item.capabilityPackIds) ||
    item.derivedStatus === undefined ||
    typeof item.draftVersion !== "number"
  ) {
    throw new Error("Invalid content item response");
  }
  return {
    ...item,
    capabilityPackIds: item.capabilityPackIds,
    derivedStatus: item.derivedStatus,
    draftVersion: item.draftVersion,
  };
}

function requireContentVersion(version: ContentVersionOut): AdminContentVersion {
  if (!version.fieldsSnapshot || !Array.isArray(version.presentations)) {
    throw new Error("Invalid content version response");
  }
  return {
    ...version,
    fieldsSnapshot: version.fieldsSnapshot,
    presentations: version.presentations,
  };
}

function normalizeContentLibraryFilters(
  filters: ContentLibraryViewFiltersSchema,
): AdminContentLibraryViewFilters {
  return {
    ...(filters.createdByUserId != null ? { createdByUserId: filters.createdByUserId } : {}),
    ...(filters.editWith != null ? { editWith: filters.editWith } : {}),
    ...(filters.locale != null ? { locale: filters.locale } : {}),
    ...(filters.modelKey != null ? { modelKey: filters.modelKey } : {}),
    ...(filters.role != null ? { role: filters.role } : {}),
    ...(filters.status != null ? { status: filters.status } : {}),
    ...(filters.tag != null ? { tag: filters.tag } : {}),
  };
}

function requireContentLibraryViewsState(
  state: ContentLibraryViewsStateOut,
): AdminContentLibraryViewsState {
  if (!Array.isArray(state.items)) {
    throw new Error("Invalid content library views response");
  }
  const items = state.items.map((view) => {
    if (!view.filters || !Array.isArray(view.sorting)) {
      throw new Error("Invalid content library view response");
    }
    const sorting = view.sorting.map((sort) => {
      if (typeof sort.desc !== "boolean") {
        throw new Error("Invalid content library view sorting response");
      }
      return { ...sort, desc: sort.desc };
    });
    return {
      ...view,
      filters: normalizeContentLibraryFilters(view.filters),
      sorting,
    };
  });
  return { ...state, items };
}

async function getRequiredContentLibraryViews(
  path: string,
): Promise<AdminContentLibraryViewsState> {
  return requireContentLibraryViewsState(await api.get<ContentLibraryViewsStateOut>(path));
}

async function postRequiredContentLibraryViews(
  path: string,
  body?: unknown,
): Promise<AdminContentLibraryViewsState> {
  return requireContentLibraryViewsState(await api.post<ContentLibraryViewsStateOut>(path, body));
}

async function patchRequiredContentLibraryViews(
  path: string,
  body?: unknown,
): Promise<AdminContentLibraryViewsState> {
  return requireContentLibraryViewsState(await api.patch<ContentLibraryViewsStateOut>(path, body));
}

async function deleteRequiredContentLibraryViews(
  path: string,
): Promise<AdminContentLibraryViewsState> {
  return requireContentLibraryViewsState(await api.delete<ContentLibraryViewsStateOut>(path));
}

async function getRequiredContentItem(path: string): Promise<AdminContentItem> {
  return requireContentItem(await api.get<ContentItemOut>(path));
}

async function postRequiredContentItem(path: string, body?: unknown): Promise<AdminContentItem> {
  return requireContentItem(await api.post<ContentItemOut>(path, body));
}

async function patchRequiredContentItem(path: string, body?: unknown): Promise<AdminContentItem> {
  return requireContentItem(await api.patch<ContentItemOut>(path, body));
}

async function postRequiredContentModel(path: string, body?: unknown): Promise<AdminContentModel> {
  return requireContentModel(await api.post<ContentModelOut>(path, body));
}

async function patchRequiredContentModel(path: string, body?: unknown): Promise<AdminContentModel> {
  return requireContentModel(await api.patch<ContentModelOut>(path, body));
}

async function deleteRequiredContentModel(path: string): Promise<AdminContentModel> {
  return requireContentModel(await api.delete<ContentModelOut>(path));
}

async function getRequiredContentVersion(path: string): Promise<AdminContentVersion> {
  return requireContentVersion(await api.get<ContentVersionOut>(path));
}

async function postRequiredContentVersion(
  path: string,
  body?: unknown,
): Promise<AdminContentVersion> {
  return requireContentVersion(await api.post<ContentVersionOut>(path, body));
}

async function patchRequiredContentVersion(
  path: string,
  body?: unknown,
): Promise<AdminContentVersion> {
  return requireContentVersion(await api.patch<ContentVersionOut>(path, body));
}

function hasRequiredContentPageMetadata(page: {
  items?: unknown[];
  page?: number;
  pages?: number;
  size?: number;
  total?: number;
}): boolean {
  return (
    Array.isArray(page.items) &&
    typeof page.page === "number" &&
    typeof page.pages === "number" &&
    typeof page.size === "number" &&
    typeof page.total === "number"
  );
}

function requireContentModelPage(page: PageDataContentModelOut): ContentModelPage {
  if (!hasRequiredContentPageMetadata(page) || !page.items) {
    throw new Error("Invalid content pagination response");
  }
  return { ...page, items: page.items.map(requireContentModel) };
}

function requireContentItemPage(page: PageDataContentItemOut): ContentItemPage {
  if (!hasRequiredContentPageMetadata(page) || !page.items) {
    throw new Error("Invalid content pagination response");
  }
  return { ...page, items: page.items.map(requireContentItem) };
}

function requireContentVersionPage(page: PageDataContentVersionOut): ContentVersionPage {
  if (!hasRequiredContentPageMetadata(page) || !page.items) {
    throw new Error("Invalid content pagination response");
  }
  return { ...page, items: page.items.map(requireContentVersion) };
}

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

async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; pages: number }>,
): Promise<T[]> {
  const firstPage = await fetchPage(1);
  const totalPages = Math.max(firstPage.pages, 1);
  if (totalPages === 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2)),
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.items);
}

export async function listContentModels(
  projectId: string,
  params: ListAdminContentModelsParams = {},
): Promise<ContentModelPage> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? CONTENT_LIST_PAGE_SIZE,
    q: params.q,
    ordering: params.ordering,
    category: params.category,
    model_kind: params.model_kind,
    system_managed: params.system_managed,
  });
  const page = await api.get<PageDataContentModelOut>(
    projectPath(projectId, `/content/models${query}`),
  );
  return requireContentModelPage(page);
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
  return postRequiredContentModel(projectPath(projectId, "/content/models"), payload);
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
  return postRequiredContentModel(
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
  return patchRequiredContentModel(
    projectPath(projectId, `/content/models/${modelId}/fields/${encodeURIComponent(fieldKey)}`),
    payload,
  );
}

export async function reorderContentModelFields(
  projectId: string,
  modelId: string,
  payload: ReorderAdminContentModelFieldsPayload,
): Promise<AdminContentModel> {
  return postRequiredContentModel(
    projectPath(projectId, `/content/models/${modelId}/fields/reorder`),
    payload,
  );
}

export async function deleteContentModelField(
  projectId: string,
  modelId: string,
  fieldKey: string,
): Promise<AdminContentModel> {
  return deleteRequiredContentModel(
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
  return patchRequiredContentModel(projectPath(projectId, `/content/models/${modelId}`), payload);
}

export async function deleteContentModel(projectId: string, modelId: string): Promise<void> {
  await api.delete(projectPath(projectId, `/content/models/${modelId}`));
}

export async function listContentItems(
  projectId: string,
  params: ListAdminContentItemsParams = {},
): Promise<ContentItemPage> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? CONTENT_LIST_PAGE_SIZE,
    modelKey: params.modelKey,
  });
  const page = await api.get<PageDataContentItemOut>(
    projectPath(projectId, `/content/items${query}`),
  );
  return requireContentItemPage(page);
}

export async function listAllContentItems(projectId: string): Promise<AdminContentItem[]> {
  return collectAllPages((page) =>
    listContentItems(projectId, { page, size: CONTENT_LIST_PAGE_SIZE }),
  );
}

export async function getContentItem(projectId: string, itemId: string): Promise<AdminContentItem> {
  return getRequiredContentItem(projectPath(projectId, `/content/items/${itemId}`));
}

export async function createContentItem(
  projectId: string,
  payload: CreateAdminContentItemPayload,
): Promise<AdminContentItem> {
  return postRequiredContentItem(projectPath(projectId, "/content/items"), payload);
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
  return postRequiredContentItem(
    projectPath(projectId, `/content/items/${itemId}/translations`),
    payload,
  );
}

export async function applyContentBootstrapShape(
  projectId: string,
  itemId: string,
  payload: ApplyAdminContentBootstrapShapePayload,
): Promise<AdminContentItem> {
  return patchRequiredContentItem(
    projectPath(projectId, `/content/items/${itemId}/bootstrap-shape`),
    payload,
  );
}

export async function archiveContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return postRequiredContentVersion(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}/archive`),
  );
}

export async function saveContentItemDraftVersion(
  projectId: string,
  itemId: string,
  payload: SaveAdminContentDraftVersionPayload,
): Promise<AdminContentVersion> {
  return postRequiredContentVersion(
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
  return getRequiredContentVersion(
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
): Promise<ContentVersionPage> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
  });
  const page = await api.get<PageDataContentVersionOut>(
    projectPath(projectId, `/content/items/${itemId}/versions${query}`),
  );
  return requireContentVersionPage(page);
}

export async function patchContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
  payload: PatchAdminContentVersionPayload,
): Promise<AdminContentVersion> {
  return patchRequiredContentVersion(
    projectPath(projectId, `/content/items/${itemId}/versions/${versionNumber}`),
    payload,
  );
}

export async function publishContentItemVersion(
  projectId: string,
  itemId: string,
  versionNumber: number,
): Promise<AdminContentVersion> {
  return postRequiredContentVersion(
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
  return postRequiredContentVersion(
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
  return patchRequiredContentItem(
    projectPath(projectId, `/content/items/${itemId}/workflow`),
    payload,
  );
}

export async function getContentLibraryViews(
  projectId: string,
): Promise<AdminContentLibraryViewsState> {
  return getRequiredContentLibraryViews(projectPath(projectId, "/content/library/views"));
}

export async function createContentLibraryView(
  projectId: string,
  payload: CreateAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return postRequiredContentLibraryViews(projectPath(projectId, "/content/library/views"), payload);
}

export async function updateContentLibraryView(
  projectId: string,
  viewId: string,
  payload: PatchAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return patchRequiredContentLibraryViews(
    projectPath(projectId, `/content/library/views/${viewId}`),
    payload,
  );
}

export async function moveContentLibraryView(
  projectId: string,
  viewId: string,
  payload: MoveAdminContentLibraryViewPayload,
): Promise<AdminContentLibraryViewsState> {
  return postRequiredContentLibraryViews(
    projectPath(projectId, `/content/library/views/${viewId}/move`),
    payload,
  );
}

export async function deleteContentLibraryView(
  projectId: string,
  viewId: string,
): Promise<AdminContentLibraryViewsState> {
  return deleteRequiredContentLibraryViews(
    projectPath(projectId, `/content/library/views/${viewId}`),
  );
}

export async function archiveContentItem(
  projectId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return postRequiredContentItem(projectPath(projectId, `/content/items/${itemId}/archive`));
}

export async function unarchiveContentItem(
  projectId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return postRequiredContentItem(projectPath(projectId, `/content/items/${itemId}/unarchive`));
}

export async function duplicateContentItem(
  projectId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return postRequiredContentItem(projectPath(projectId, `/content/items/${itemId}/duplicate`));
}

export async function deleteContentItem(projectId: string, itemId: string): Promise<void> {
  await api.delete<void>(projectPath(projectId, `/content/items/${itemId}`));
}
