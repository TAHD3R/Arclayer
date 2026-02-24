import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type WorkspaceSite = {
  siteId: string;
  workspaceId: string;
  slug: string;
  name: string;
  defaultLocale: string;
  fallbackLocale: string;
  primaryHost?: string | null;
  isActive: boolean;
};

export type PreviewTokenRequest = {
  ttlSeconds?: number;
};

export type PreviewTokenOut = {
  siteId: string;
  token: string;
  expiresAtMs: number;
};

export type SiteSettingDetail = {
  namespace: string;
  value: Record<string, unknown> | null;
};

export type SitePageTreeNode = {
  id: string;
  title?: string | null;
  description?: string | null;
  path: string;
  parentId?: string | null;
  sortOrder: number;
  visibility: "public" | "private";
  draftRevision: number;
  publishedRevision?: number | null;
  updatedAt?: string | null;
  updatedBy?: SitePageUserSummary | null;
  children: SitePageTreeNode[];
};

export type SitePageUserSummary = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

export type SitePageCreateIn = {
  title?: string | null;
  description?: string | null;
  path: string;
  parentId?: string | null;
  sortOrder?: number;
  visibility?: "public" | "private";
};

export type SitePageUpdateIn = Partial<SitePageCreateIn>;

export type SitePageDraftSaveIn = {
  document: unknown;
  meta?: Record<string, unknown> | null;
  styleOverrides?: Record<string, unknown> | null;
  variantId?: string | null;
  deps?: Record<string, unknown> | null;
  expectedRevision?: number | null;
};

export type SitePageDraftSaveOut = {
  siteId: string;
  pageId: string;
  path: string;
  revision: number;
  savedAtMs: number;
};

export type SitePagePublishIn = {
  revision?: number | null;
};

export type SitePagePublishOut = {
  siteId: string;
  pageId: string;
  path: string;
  revision: number;
  publishedAtMs: number;
};

export type SitePageRevisionOut = {
  pageId: string;
  state: "draft" | "published";
  revision: number;
  createdAtMs: number;
  document: unknown;
  meta?: Record<string, unknown> | null;
  styleOverrides?: Record<string, unknown> | null;
  variantId?: string | null;
  deps?: Record<string, unknown> | null;
};

export type SiteEntryRevisionOut = {
  entryId: string;
  state: "draft" | "published";
  revision: number;
  createdAtMs: number;
  document?: unknown;
  data?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  styleOverrides?: Record<string, unknown> | null;
  variantId?: string | null;
  deps?: Record<string, unknown> | null;
};

export type SitePageUnpublishOut = {
  siteId: string;
  pageId: string;
  path: string;
  unpublishedAtMs: number;
};

export type SiteEntryType = {
  id: string;
  siteId: string;
  code: string;
  name: string;
  fieldsSchema?: Record<string, unknown> | null;
};

export type SiteEntry = {
  id: string;
  siteId: string;
  entryTypeId: string;
  entryTypeCode: string;
  slug: string;
  draftRevision: number;
  publishedRevision?: number | null;
};

export type SiteEntryTypeCreateIn = {
  code: string;
  name: string;
  fieldsSchema?: Record<string, unknown> | null;
};

export type SiteEntryTypeUpdateIn = {
  name?: string;
  fieldsSchema?: Record<string, unknown> | null;
};

export type SiteEntryCreateIn = {
  entryTypeCode: string;
  slug: string;
};

export type SiteEntryUpdateIn = {
  slug?: string;
};

export type SiteEntryDraftSaveIn = {
  entryTypeCode: string;
  slug: string;
  document?: unknown;
  data?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  styleOverrides?: Record<string, unknown> | null;
  variantId?: string | null;
  deps?: Record<string, unknown> | null;
  expectedRevision?: number | null;
};

export type SiteEntryDraftSaveOut = {
  siteId: string;
  entryId: string;
  entryTypeCode: string;
  slug: string;
  revision: number;
  savedAtMs: number;
};

export type SiteEntryPublishIn = {
  entryTypeCode: string;
  slug: string;
  revision?: number | null;
};

export type SiteEntryPublishOut = {
  siteId: string;
  entryId: string;
  entryTypeCode: string;
  slug: string;
  revision: number;
  publishedAtMs: number;
};

export type SiteEntryUnpublishIn = {
  entryTypeCode: string;
  slug: string;
};

export type SiteEntryUnpublishOut = {
  siteId: string;
  entryId: string;
  entryTypeCode: string;
  slug: string;
  unpublishedAtMs: number;
};

export type SiteEntryDeleteOut = {
  entryId: string;
};

export type SiteEntryTypeDeleteOut = {
  entryTypeId: string;
};

export type SiteStyleOut = {
  namespace: string;
  value: Record<string, unknown> | null;
};

export type SiteStyleUpsertIn = {
  value: Record<string, unknown> | null;
};

export type SiteGlobalSection = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  payload?: Record<string, unknown> | null;
  updatedAtMs: number;
};

export type SiteGlobalSectionsOut = {
  items: SiteGlobalSection[];
};

export type SiteGlobalSectionCreateIn = {
  name: string;
  kind: string;
  enabled?: boolean;
  payload?: Record<string, unknown> | null;
};

export type SiteGlobalSectionUpdateIn = Partial<SiteGlobalSectionCreateIn>;

export type SiteGlobalSectionDeleteOut = {
  id: string;
};

export type SiteVisualSitemapNode = {
  id: string;
  title: string;
  path: string;
  pageId?: string | null;
  children: SiteVisualSitemapNode[];
};

export type SiteVisualSitemapOut = {
  nodes: SiteVisualSitemapNode[];
  updatedAtMs: number;
};

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
    workspacePath(workspaceId, `/site/settings?namespace=${encodeURIComponent(namespace)}`),
  );
}

export async function upsertWorkspaceSiteSetting(
  workspaceId: string,
  namespace: string,
  value: Record<string, unknown> | null,
): Promise<SiteSettingDetail> {
  return api.put<SiteSettingDetail>(
    workspacePath(workspaceId, `/site/settings?namespace=${encodeURIComponent(namespace)}`),
    { value },
  );
}

export async function listWorkspaceSitePagesTree(
  workspaceId: string,
): Promise<PageData<SitePageTreeNode>> {
  return api.get<PageData<SitePageTreeNode>>(workspacePath(workspaceId, "/content/pages/tree"));
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
  const qs = new URLSearchParams();
  if (typeof params?.page === "number") qs.set("page", String(params.page));
  if (typeof params?.size === "number") qs.set("size", String(params.size));
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return api.get<PageData<SiteEntryType>>(workspacePath(workspaceId, `/content/types${suffix}`));
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
  const qs = new URLSearchParams();
  if (typeof params?.page === "number") qs.set("page", String(params.page));
  if (typeof params?.size === "number") qs.set("size", String(params.size));
  if (params?.entryTypeCode) qs.set("entryTypeCode", params.entryTypeCode);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return api.get<PageData<SiteEntry>>(workspacePath(workspaceId, `/content/entries${suffix}`));
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

export async function getWorkspaceSiteVisualSitemap(
  workspaceId: string,
): Promise<SiteVisualSitemapOut> {
  return api.get<SiteVisualSitemapOut>(workspacePath(workspaceId, "/site/sitemap/visual"));
}
