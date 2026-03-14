import {
  archiveWorkspaceContentItemVersion,
  createWorkspaceContentItem,
  listWorkspaceContentItems,
  publishWorkspaceContentItemVersion,
  type ContentItemOut,
} from "@/api/content-items";
import { listWorkspaceContentModels } from "@/api/content-models";
import {
  listWorkspaceContentHierarchyNodes,
  listWorkspaceContentRouteBindings,
  upsertWorkspaceContentHierarchyNode,
  upsertWorkspaceContentRouteBinding,
  type HierarchyNodeOut,
  type RouteBindingOut,
} from "@/api/content-routing";
import { getWorkspacePublishImpact } from "@/api/content-publish";
import { workspacePath } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  PageData,
  SiteGlobalSection,
  SiteGlobalSectionsOut,
  WorkspacePublishImpact,
} from "@/types/api";
import type { ContentModelSummary } from "@/api/content-models";

export type SiteBuilderStructureNode = {
  id: string;
  title?: string | null;
  modelKey: string;
  path: string;
  parentId?: string | null;
  sortOrder: number;
  draftRevision: number;
  publishedRevision?: number | null;
  children: SiteBuilderStructureNode[];
};

export type SiteBuilderGlobalSection = SiteGlobalSection;

export type SiteBuilderRouteTemplate = {
  id: string;
  itemId: string;
  itemTitle?: string | null;
  pathPattern: string;
  entryTypeCode: string;
  isActive: boolean;
};

export type SiteBuilderPublishImpact = WorkspacePublishImpact;

export type SiteBuilderStructureNodeCreateIn = {
  title: string;
  path: string;
  modelKey: string;
};

export type SiteBuilderRouteTemplateCreateIn = {
  itemId: string;
  pathPattern: string;
  isActive: boolean;
};

export type SiteBuilderPublishOut = {
  itemId: string;
  revision: number;
};

export type SiteBuilderUnpublishOut = {
  itemId: string;
  revision: number | null;
};

const DEFAULT_ROUTE_TEMPLATE_PAGE_SIZE = 50;
const DEFAULT_STRUCTURE_PAGE_SIZE = 100;
const UNBOUND_ROUTE_LABEL = "(unbound route)";

export const siteBuilderQueryKeys = {
  structure: (workspaceId: string | null | undefined) => [
    "content",
    "site-builder",
    "structure",
    workspaceId,
  ],
  globals: (workspaceId: string | null | undefined) => [
    "content",
    "site-builder",
    "globals",
    workspaceId,
  ],
  routes: (workspaceId: string | null | undefined) => [
    "content",
    "site-builder",
    "routes",
    workspaceId,
  ],
  publishImpact: (workspaceId: string | null | undefined) => [
    "content",
    "site-builder",
    "publish-impact",
    workspaceId,
  ],
} as const;

const STRUCTURE_MODEL_CAPABILITIES = [
  "routable",
  "visual_editable",
  "rich_text_editable",
  "has_slots",
] as const;

function supportsSiteStructure(model: ContentModelSummary): boolean {
  if (model.category === "system") return false;
  return STRUCTURE_MODEL_CAPABILITIES.some((capability) => model.capabilities.includes(capability));
}

function isStructureModelKey(modelKey: string, allowedModelKeys: ReadonlySet<string>): boolean {
  return allowedModelKeys.has(modelKey);
}

function buildStructureModelKeys(items: readonly ContentModelSummary[]): Set<string> {
  return new Set(items.filter(supportsSiteStructure).map((item) => item.key));
}

function buildPath(routeBindings: RouteBindingOut[], itemId: string, slug: string): string {
  const activeBinding = routeBindings.find(
    (binding) => binding.itemId === itemId && binding.isActive,
  );
  if (activeBinding?.path) return activeBinding.path;
  return slug ? `${UNBOUND_ROUTE_LABEL} ${slug}` : UNBOUND_ROUTE_LABEL;
}

function buildTree(
  items: ContentItemOut[],
  hierarchyNodes: HierarchyNodeOut[],
  routeBindings: RouteBindingOut[],
): SiteBuilderStructureNode[] {
  const hierarchyByItemId = new Map(hierarchyNodes.map((node) => [node.itemId, node]));
  const childMap = new Map<string, SiteBuilderStructureNode[]>();
  const nodesById = new Map<string, SiteBuilderStructureNode>();

  for (const item of items) {
    const hierarchy = hierarchyByItemId.get(item.id);
    nodesById.set(item.id, {
      id: item.id,
      title: item.title,
      modelKey: item.modelKey,
      path: buildPath(routeBindings, item.id, item.slug),
      parentId: hierarchy?.parentItemId ?? null,
      sortOrder: hierarchy?.sortOrder ?? 0,
      draftRevision: item.draftVersion,
      publishedRevision: item.publishedVersion ?? null,
      children: [],
    });
  }

  const roots: SiteBuilderStructureNode[] = [];
  for (const node of nodesById.values()) {
    if (!node.parentId || !nodesById.has(node.parentId)) {
      roots.push(node);
      continue;
    }
    const siblings = childMap.get(node.parentId) ?? [];
    siblings.push(node);
    childMap.set(node.parentId, siblings);
  }

  for (const node of nodesById.values()) {
    node.children = (childMap.get(node.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return roots.sort((a, b) => a.sortOrder - b.sortOrder);
}

async function loadSiteBuilderRecords(workspaceId: string) {
  const [models, items, routeBindings, hierarchyNodes] = await Promise.all([
    listWorkspaceContentModels(workspaceId, { page: 1, size: DEFAULT_STRUCTURE_PAGE_SIZE }),
    listWorkspaceContentItems(workspaceId, { page: 1, size: DEFAULT_STRUCTURE_PAGE_SIZE }),
    listWorkspaceContentRouteBindings(workspaceId),
    listWorkspaceContentHierarchyNodes(workspaceId),
  ]);
  const allowedModelKeys = buildStructureModelKeys(models.items ?? []);
  const filteredItems = (items.items ?? []).filter((item) =>
    isStructureModelKey(item.modelKey, allowedModelKeys),
  );
  const filteredIds = new Set(filteredItems.map((item) => item.id));
  return {
    filteredItems,
    routeBindings: routeBindings.filter((binding) => filteredIds.has(binding.itemId)),
    hierarchyNodes: hierarchyNodes.filter((node) => filteredIds.has(node.itemId)),
  };
}

export async function listSiteBuilderStructureTree(
  workspaceId: string,
): Promise<PageData<SiteBuilderStructureNode>> {
  const records = await loadSiteBuilderRecords(workspaceId);
  const items = buildTree(records.filteredItems, records.hierarchyNodes, records.routeBindings);
  return {
    items,
    total: records.filteredItems.length,
    page: 1,
    size: DEFAULT_STRUCTURE_PAGE_SIZE,
    pages: 1,
    next: null,
    prev: null,
  };
}

export function listSiteBuilderGlobalSections(workspaceId: string): Promise<SiteGlobalSectionsOut> {
  return api.get<SiteGlobalSectionsOut>(
    workspacePath(workspaceId, "/content/structure/global-slots"),
  );
}

export async function listSiteBuilderRouteTemplates(
  workspaceId: string,
  _params?: { page?: number; size?: number },
): Promise<PageData<SiteBuilderRouteTemplate>> {
  const records = await loadSiteBuilderRecords(workspaceId);
  const itemById = new Map(records.filteredItems.map((item) => [item.id, item]));
  const items = records.routeBindings.map((binding) => ({
    id: binding.id,
    itemId: binding.itemId,
    itemTitle: itemById.get(binding.itemId)?.title ?? null,
    pathPattern: binding.path,
    entryTypeCode: itemById.get(binding.itemId)?.modelKey ?? "",
    isActive: binding.isActive,
  }));
  return {
    items,
    total: items.length,
    page: 1,
    size: DEFAULT_ROUTE_TEMPLATE_PAGE_SIZE,
    pages: 1,
    next: null,
    prev: null,
  };
}

export function getSiteBuilderPublishImpact(
  workspaceId: string,
): Promise<SiteBuilderPublishImpact> {
  return getWorkspacePublishImpact(workspaceId);
}

export async function createSiteBuilderStructureNode(
  workspaceId: string,
  payload: SiteBuilderStructureNodeCreateIn,
): Promise<SiteBuilderStructureNode> {
  const item = await createWorkspaceContentItem(workspaceId, {
    modelKey: payload.modelKey,
    title: payload.title,
    slug: payload.path.replace(/^\//, "") || "home",
  });
  await Promise.all([
    upsertWorkspaceContentRouteBinding(workspaceId, item.id, {
      path: payload.path,
      isActive: true,
    }),
    upsertWorkspaceContentHierarchyNode(workspaceId, item.id, {}),
  ]);

  return {
    id: item.id,
    title: item.title,
    modelKey: item.modelKey,
    path: payload.path,
    parentId: null,
    sortOrder: 0,
    draftRevision: item.draftVersion,
    publishedRevision: item.publishedVersion ?? null,
    children: [],
  };
}

export async function createSiteBuilderRouteTemplate(
  workspaceId: string,
  payload: SiteBuilderRouteTemplateCreateIn,
): Promise<SiteBuilderRouteTemplate> {
  const binding = await upsertWorkspaceContentRouteBinding(workspaceId, payload.itemId, {
    path: payload.pathPattern,
    isActive: payload.isActive,
  });
  return {
    id: binding.id,
    itemId: binding.itemId,
    itemTitle: null,
    pathPattern: binding.path,
    entryTypeCode: "",
    isActive: binding.isActive,
  };
}

export async function toggleSiteBuilderRouteTemplateActive(
  workspaceId: string,
  routeTemplate: Pick<SiteBuilderRouteTemplate, "id" | "itemId" | "pathPattern" | "isActive">,
): Promise<SiteBuilderRouteTemplate> {
  const binding = await upsertWorkspaceContentRouteBinding(workspaceId, routeTemplate.itemId, {
    path: routeTemplate.pathPattern,
    isActive: !routeTemplate.isActive,
  });
  return {
    ...routeTemplate,
    id: binding.id,
    pathPattern: binding.path,
    isActive: binding.isActive,
  };
}

export async function publishSiteBuilderStructureNode(
  workspaceId: string,
  itemId: string,
  payload: { revision?: number } = {},
): Promise<SiteBuilderPublishOut> {
  const version = await publishWorkspaceContentItemVersion(
    workspaceId,
    itemId,
    payload.revision ?? 1,
  );
  return { itemId, revision: version.versionNumber };
}

export async function unpublishSiteBuilderStructureNode(
  workspaceId: string,
  itemId: string,
  publishedRevision: number,
): Promise<SiteBuilderUnpublishOut> {
  const version = await archiveWorkspaceContentItemVersion(workspaceId, itemId, publishedRevision);
  return { itemId, revision: version.versionNumber };
}
