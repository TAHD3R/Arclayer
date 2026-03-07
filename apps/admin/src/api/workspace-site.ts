import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type {
  PageData,
  WorkspaceSite,
  PreviewTokenRequest,
  PreviewTokenOut,
  SiteSettingDetail,
  SitePageTreeNode,
  SitePageCreateIn,
  SitePageUpdateIn,
  SitePageDraftSaveIn,
  SitePageDraftSaveOut,
  SitePagePublishIn,
  SitePagePublishOut,
  SitePageRevisionOut,
  SitePageUnpublishOut,
  SitePageRouteTreeRepairOut,
  SiteEntryRevisionOut,
  SiteEntryType,
  SiteEntry,
  SiteEntryTypeCreateIn,
  SiteEntryTypeUpdateIn,
  SiteEntryCreateIn,
  SiteEntryUpdateIn,
  SiteEntryDraftSaveIn,
  SiteEntryDraftSaveOut,
  SiteEntryPublishIn,
  SiteEntryPublishOut,
  SiteEntryUnpublishIn,
  SiteEntryUnpublishOut,
  SiteEntryDeleteOut,
  SiteEntryTypeDeleteOut,
  SiteStyleOut,
  SiteStyleUpsertIn,
  SiteGlobalSection,
  SiteGlobalSectionsOut,
  SiteGlobalSectionCreateIn,
  SiteGlobalSectionUpdateIn,
  SiteGlobalSectionDeleteOut,
  SiteRouteTemplate,
  SiteRouteTemplateCreateIn,
  SiteRouteTemplateUpdateIn,
  SiteRouteTemplateDeleteOut,
  SiteVisualSitemapOut,
} from "@/types/api";

export async function getWorkspaceSite(workspaceId: string): Promise<WorkspaceSite> {
  return api.get<WorkspaceSite>(workspacePath(workspaceId, "/site"));
}

export async function issueWorkspaceSitePreviewToken(
  workspaceId: string,
  payload: PreviewTokenRequest = {},
): Promise<PreviewTokenOut> {
  return api.post<PreviewTokenOut>(workspacePath(workspaceId, "/site/preview-tokens"), payload);
}

export async function getWorkspaceSiteSetting(
  workspaceId: string,
  namespace: string,
): Promise<SiteSettingDetail> {
  return api.get<SiteSettingDetail>(
    workspacePath(workspaceId, `/site/settings${toQueryString({ namespace })}`),
  );
}

export async function upsertWorkspaceSiteSetting(
  workspaceId: string,
  namespace: string,
  value: Record<string, unknown> | null,
): Promise<SiteSettingDetail> {
  return api.put<SiteSettingDetail>(
    workspacePath(workspaceId, `/site/settings${toQueryString({ namespace })}`),
    { value },
  );
}

export async function listWorkspaceSitePagesTree(
  workspaceId: string,
): Promise<PageData<SitePageTreeNode>> {
  return api.get<PageData<SitePageTreeNode>>(workspacePath(workspaceId, "/content/pages/tree"));
}

export async function repairWorkspaceSitePagesRouteTree(
  workspaceId: string,
): Promise<SitePageRouteTreeRepairOut> {
  return api.post<SitePageRouteTreeRepairOut>(
    workspacePath(workspaceId, "/content/pages/repair-route-tree"),
    {},
  );
}

export async function getWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
): Promise<SitePageTreeNode> {
  return api.get<SitePageTreeNode>(
    workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}`),
  );
}

export async function createWorkspaceSitePage(
  workspaceId: string,
  payload: SitePageCreateIn,
): Promise<SitePageTreeNode> {
  return api.post<SitePageTreeNode>(workspacePath(workspaceId, "/content/pages"), payload);
}

export async function patchWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
  payload: SitePageUpdateIn,
): Promise<SitePageTreeNode> {
  return api.patch<SitePageTreeNode>(
    workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}`),
    payload,
  );
}

export async function deleteWorkspaceSitePage(workspaceId: string, pageId: string): Promise<void> {
  await api.delete(workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}`));
}

export async function saveWorkspaceSitePageDraft(
  workspaceId: string,
  pageId: string,
  payload: SitePageDraftSaveIn,
): Promise<SitePageDraftSaveOut> {
  return api.post<SitePageDraftSaveOut>(
    workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}/revisions/draft`),
    payload,
  );
}

export async function publishWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
  payload: SitePagePublishIn = {},
): Promise<SitePagePublishOut> {
  return api.post<SitePagePublishOut>(
    workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}/revisions/publish`),
    payload,
  );
}

export async function getWorkspaceSitePageDraftRevision(
  workspaceId: string,
  pageId: string,
): Promise<SitePageRevisionOut> {
  return api.get<SitePageRevisionOut>(
    workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}/revisions/draft`),
  );
}

export async function getWorkspaceSitePagePublishedRevision(
  workspaceId: string,
  pageId: string,
): Promise<SitePageRevisionOut> {
  return api.get<SitePageRevisionOut>(
    workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}/revisions/published`),
  );
}

export async function unpublishWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
): Promise<SitePageUnpublishOut> {
  return api.post<SitePageUnpublishOut>(
    workspacePath(workspaceId, `/content/pages/${encodeURIComponent(pageId)}/revisions/unpublish`),
    {},
  );
}

export async function listWorkspaceSiteEntryTypes(
  workspaceId: string,
  params?: { page?: number; size?: number },
): Promise<PageData<SiteEntryType>> {
  const query = toQueryString({ page: params?.page, size: params?.size });
  return api.get<PageData<SiteEntryType>>(workspacePath(workspaceId, `/content/types${query}`));
}

export async function createWorkspaceSiteEntryType(
  workspaceId: string,
  payload: SiteEntryTypeCreateIn,
): Promise<SiteEntryType> {
  return api.post<SiteEntryType>(workspacePath(workspaceId, "/content/types"), payload);
}

export async function patchWorkspaceSiteEntryType(
  workspaceId: string,
  entryTypeId: string,
  payload: SiteEntryTypeUpdateIn,
): Promise<SiteEntryType> {
  return api.patch<SiteEntryType>(
    workspacePath(workspaceId, `/content/types/${encodeURIComponent(entryTypeId)}`),
    payload,
  );
}

export async function deleteWorkspaceSiteEntryType(
  workspaceId: string,
  entryTypeId: string,
): Promise<SiteEntryTypeDeleteOut> {
  return api.delete<SiteEntryTypeDeleteOut>(
    workspacePath(workspaceId, `/content/types/${encodeURIComponent(entryTypeId)}`),
  );
}

export async function listWorkspaceSiteEntries(
  workspaceId: string,
  params?: { page?: number; size?: number; entryTypeCode?: string },
): Promise<PageData<SiteEntry>> {
  const query = toQueryString({
    page: params?.page,
    size: params?.size,
    entryTypeCode: params?.entryTypeCode,
  });
  return api.get<PageData<SiteEntry>>(workspacePath(workspaceId, `/content/entries${query}`));
}

export async function createWorkspaceSiteEntry(
  workspaceId: string,
  payload: SiteEntryCreateIn,
): Promise<SiteEntry> {
  return api.post<SiteEntry>(workspacePath(workspaceId, "/content/entries"), payload);
}

export async function patchWorkspaceSiteEntry(
  workspaceId: string,
  entryId: string,
  payload: SiteEntryUpdateIn,
): Promise<SiteEntry> {
  return api.patch<SiteEntry>(
    workspacePath(workspaceId, `/content/entries/${encodeURIComponent(entryId)}`),
    payload,
  );
}

export async function deleteWorkspaceSiteEntry(
  workspaceId: string,
  entryId: string,
): Promise<SiteEntryDeleteOut> {
  return api.delete<SiteEntryDeleteOut>(
    workspacePath(workspaceId, `/content/entries/${encodeURIComponent(entryId)}`),
  );
}

export async function saveWorkspaceSiteEntryDraft(
  workspaceId: string,
  payload: SiteEntryDraftSaveIn,
): Promise<SiteEntryDraftSaveOut> {
  return api.post<SiteEntryDraftSaveOut>(
    workspacePath(workspaceId, "/content/entries/draft"),
    payload,
  );
}

export async function publishWorkspaceSiteEntry(
  workspaceId: string,
  payload: SiteEntryPublishIn,
): Promise<SiteEntryPublishOut> {
  return api.post<SiteEntryPublishOut>(
    workspacePath(workspaceId, "/content/entries/publish"),
    payload,
  );
}

export async function unpublishWorkspaceSiteEntry(
  workspaceId: string,
  payload: SiteEntryUnpublishIn,
): Promise<SiteEntryUnpublishOut> {
  return api.post<SiteEntryUnpublishOut>(
    workspacePath(workspaceId, "/content/entries/unpublish"),
    payload,
  );
}

export async function getWorkspaceSiteEntryPublishedRevision(
  workspaceId: string,
  entryId: string,
): Promise<SiteEntryRevisionOut> {
  return api.get<SiteEntryRevisionOut>(
    workspacePath(
      workspaceId,
      `/content/entries/${encodeURIComponent(entryId)}/revisions/published`,
    ),
  );
}

export async function getWorkspaceSiteEntryDraftRevision(
  workspaceId: string,
  entryId: string,
): Promise<SiteEntryRevisionOut> {
  return api.get<SiteEntryRevisionOut>(
    workspacePath(workspaceId, `/content/entries/${encodeURIComponent(entryId)}/revisions/draft`),
  );
}

export async function getWorkspaceSiteStyle(workspaceId: string): Promise<SiteStyleOut> {
  return api.get<SiteStyleOut>(workspacePath(workspaceId, "/content/appearance/styles/global"));
}

export async function upsertWorkspaceSiteStyle(
  workspaceId: string,
  payload: SiteStyleUpsertIn,
): Promise<SiteStyleOut> {
  return api.put<SiteStyleOut>(
    workspacePath(workspaceId, "/content/appearance/styles/global"),
    payload,
  );
}

export async function listWorkspaceSiteGlobalSections(
  workspaceId: string,
): Promise<SiteGlobalSectionsOut> {
  return api.get<SiteGlobalSectionsOut>(
    workspacePath(workspaceId, "/content/structure/global-slots"),
  );
}

export async function createWorkspaceSiteGlobalSection(
  workspaceId: string,
  payload: SiteGlobalSectionCreateIn,
): Promise<SiteGlobalSection> {
  return api.post<SiteGlobalSection>(
    workspacePath(workspaceId, "/content/structure/global-slots"),
    payload,
  );
}

export async function patchWorkspaceSiteGlobalSection(
  workspaceId: string,
  sectionId: string,
  payload: SiteGlobalSectionUpdateIn,
): Promise<SiteGlobalSection> {
  return api.patch<SiteGlobalSection>(
    workspacePath(workspaceId, `/content/structure/global-slots/${encodeURIComponent(sectionId)}`),
    payload,
  );
}

export async function deleteWorkspaceSiteGlobalSection(
  workspaceId: string,
  sectionId: string,
): Promise<SiteGlobalSectionDeleteOut> {
  return api.delete<SiteGlobalSectionDeleteOut>(
    workspacePath(workspaceId, `/content/structure/global-slots/${encodeURIComponent(sectionId)}`),
  );
}

export async function listWorkspaceSiteRouteTemplates(
  workspaceId: string,
  params?: { page?: number; size?: number },
): Promise<PageData<SiteRouteTemplate>> {
  const query = toQueryString({ page: params?.page, size: params?.size });
  return api.get<PageData<SiteRouteTemplate>>(
    workspacePath(workspaceId, `/content/structure/routes${query}`),
  );
}

export async function createWorkspaceSiteRouteTemplate(
  workspaceId: string,
  payload: SiteRouteTemplateCreateIn,
): Promise<SiteRouteTemplate> {
  return api.post<SiteRouteTemplate>(
    workspacePath(workspaceId, "/content/structure/routes"),
    payload,
  );
}

export async function patchWorkspaceSiteRouteTemplate(
  workspaceId: string,
  routeTemplateId: string,
  payload: SiteRouteTemplateUpdateIn,
): Promise<SiteRouteTemplate> {
  return api.patch<SiteRouteTemplate>(
    workspacePath(workspaceId, `/content/structure/routes/${encodeURIComponent(routeTemplateId)}`),
    payload,
  );
}

export async function deleteWorkspaceSiteRouteTemplate(
  workspaceId: string,
  routeTemplateId: string,
): Promise<SiteRouteTemplateDeleteOut> {
  return api.delete<SiteRouteTemplateDeleteOut>(
    workspacePath(workspaceId, `/content/structure/routes/${encodeURIComponent(routeTemplateId)}`),
  );
}

export async function getWorkspaceSiteVisualSitemap(
  workspaceId: string,
): Promise<SiteVisualSitemapOut> {
  return api.get<SiteVisualSitemapOut>(workspacePath(workspaceId, "/site/sitemap/visual"));
}
