import {
  createWorkspaceSitePage,
  createWorkspaceSiteRouteTemplate,
  getWorkspacePublishImpact,
  listWorkspaceSiteGlobalSections,
  listWorkspaceSitePagesTree,
  listWorkspaceSiteRouteTemplates,
  patchWorkspaceSiteRouteTemplate,
  publishWorkspaceSitePage,
  repairWorkspaceSitePagesRouteTree,
  unpublishWorkspaceSitePage,
} from "@/api/workspace-site";
import type {
  PageData,
  SiteGlobalSection,
  SiteGlobalSectionsOut,
  SitePageCreateIn,
  SitePagePublishIn,
  SitePagePublishOut,
  SitePageRouteTreeRepairOut,
  SitePageTreeNode,
  SitePageUnpublishOut,
  SiteRouteTemplate,
  SiteRouteTemplateCreateIn,
  WorkspacePublishImpact,
} from "@/types/api";

export type SiteBuilderPageNode = SitePageTreeNode;
export type SiteBuilderGlobalSection = SiteGlobalSection;
export type SiteBuilderRouteTemplate = SiteRouteTemplate;
export type SiteBuilderPublishImpact = WorkspacePublishImpact;

const DEFAULT_ROUTE_TEMPLATE_PAGE_SIZE = 50;

export const siteBuilderQueryKeys = {
  pages: (workspaceId: string | null | undefined) => [
    "content",
    "site-builder",
    "pages",
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

export function listSiteBuilderPagesTree(
  workspaceId: string,
): Promise<PageData<SiteBuilderPageNode>> {
  return listWorkspaceSitePagesTree(workspaceId);
}

export function listSiteBuilderGlobalSections(workspaceId: string): Promise<SiteGlobalSectionsOut> {
  return listWorkspaceSiteGlobalSections(workspaceId);
}

export function listSiteBuilderRouteTemplates(
  workspaceId: string,
  params?: { page?: number; size?: number },
): Promise<PageData<SiteBuilderRouteTemplate>> {
  return listWorkspaceSiteRouteTemplates(workspaceId, {
    page: params?.page,
    size: params?.size ?? DEFAULT_ROUTE_TEMPLATE_PAGE_SIZE,
  });
}

export function getSiteBuilderPublishImpact(
  workspaceId: string,
): Promise<SiteBuilderPublishImpact> {
  return getWorkspacePublishImpact(workspaceId);
}

export function createSiteBuilderPage(
  workspaceId: string,
  payload: SitePageCreateIn,
): Promise<SiteBuilderPageNode> {
  return createWorkspaceSitePage(workspaceId, payload);
}

export function createSiteBuilderRouteTemplate(
  workspaceId: string,
  payload: SiteRouteTemplateCreateIn,
): Promise<SiteBuilderRouteTemplate> {
  return createWorkspaceSiteRouteTemplate(workspaceId, payload);
}

export function toggleSiteBuilderRouteTemplateActive(
  workspaceId: string,
  routeTemplate: Pick<SiteBuilderRouteTemplate, "id" | "isActive">,
): Promise<SiteBuilderRouteTemplate> {
  return patchWorkspaceSiteRouteTemplate(workspaceId, routeTemplate.id, {
    isActive: !routeTemplate.isActive,
  });
}

export function publishSiteBuilderPage(
  workspaceId: string,
  pageId: string,
  payload: SitePagePublishIn = {},
): Promise<SitePagePublishOut> {
  return publishWorkspaceSitePage(workspaceId, pageId, payload);
}

export function unpublishSiteBuilderPage(
  workspaceId: string,
  pageId: string,
): Promise<SitePageUnpublishOut> {
  return unpublishWorkspaceSitePage(workspaceId, pageId);
}

export function repairSiteBuilderPagesRouteTree(
  workspaceId: string,
): Promise<SitePageRouteTreeRepairOut> {
  return repairWorkspaceSitePagesRouteTree(workspaceId);
}
