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

export type SitePageUnpublishOut = {
  siteId: string;
  pageId: string;
  path: string;
  unpublishedAtMs: number;
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
  return api.get<PageData<SitePageTreeNode>>(workspacePath(workspaceId, "/site/pages/tree"));
}

export async function getWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
): Promise<SitePageTreeNode> {
  return api.get<SitePageTreeNode>(
    workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}`),
  );
}

export async function createWorkspaceSitePage(
  workspaceId: string,
  payload: SitePageCreateIn,
): Promise<SitePageTreeNode> {
  return api.post<SitePageTreeNode>(workspacePath(workspaceId, "/site/pages"), payload);
}

export async function patchWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
  payload: SitePageUpdateIn,
): Promise<SitePageTreeNode> {
  return api.patch<SitePageTreeNode>(
    workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}`),
    payload,
  );
}

export async function deleteWorkspaceSitePage(workspaceId: string, pageId: string): Promise<void> {
  await api.delete(workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}`));
}

export async function saveWorkspaceSitePageDraft(
  workspaceId: string,
  pageId: string,
  payload: SitePageDraftSaveIn,
): Promise<SitePageDraftSaveOut> {
  return api.post<SitePageDraftSaveOut>(
    workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}/revisions/draft`),
    payload,
  );
}

export async function publishWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
  payload: SitePagePublishIn = {},
): Promise<SitePagePublishOut> {
  return api.post<SitePagePublishOut>(
    workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}/revisions/publish`),
    payload,
  );
}

export async function getWorkspaceSitePageDraftRevision(
  workspaceId: string,
  pageId: string,
): Promise<SitePageRevisionOut> {
  return api.get<SitePageRevisionOut>(
    workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}/revisions/draft`),
  );
}

export async function getWorkspaceSitePagePublishedRevision(
  workspaceId: string,
  pageId: string,
): Promise<SitePageRevisionOut> {
  return api.get<SitePageRevisionOut>(
    workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}/revisions/published`),
  );
}

export async function unpublishWorkspaceSitePage(
  workspaceId: string,
  pageId: string,
): Promise<SitePageUnpublishOut> {
  return api.post<SitePageUnpublishOut>(
    workspacePath(workspaceId, `/site/pages/${encodeURIComponent(pageId)}/revisions/unpublish`),
    {},
  );
}

export async function getWorkspaceSiteStyle(workspaceId: string): Promise<SiteStyleOut> {
  return api.get<SiteStyleOut>(workspacePath(workspaceId, "/site/style"));
}

export async function upsertWorkspaceSiteStyle(
  workspaceId: string,
  payload: SiteStyleUpsertIn,
): Promise<SiteStyleOut> {
  return api.put<SiteStyleOut>(workspacePath(workspaceId, "/site/style"), payload);
}

export async function listWorkspaceSiteGlobalSections(
  workspaceId: string,
): Promise<SiteGlobalSectionsOut> {
  return api.get<SiteGlobalSectionsOut>(workspacePath(workspaceId, "/site/global-sections"));
}

export async function createWorkspaceSiteGlobalSection(
  workspaceId: string,
  payload: SiteGlobalSectionCreateIn,
): Promise<SiteGlobalSection> {
  return api.post<SiteGlobalSection>(workspacePath(workspaceId, "/site/global-sections"), payload);
}

export async function patchWorkspaceSiteGlobalSection(
  workspaceId: string,
  sectionId: string,
  payload: SiteGlobalSectionUpdateIn,
): Promise<SiteGlobalSection> {
  return api.patch<SiteGlobalSection>(
    workspacePath(workspaceId, `/site/global-sections/${encodeURIComponent(sectionId)}`),
    payload,
  );
}

export async function deleteWorkspaceSiteGlobalSection(
  workspaceId: string,
  sectionId: string,
): Promise<SiteGlobalSectionDeleteOut> {
  return api.delete<SiteGlobalSectionDeleteOut>(
    workspacePath(workspaceId, `/site/global-sections/${encodeURIComponent(sectionId)}`),
  );
}

export async function getWorkspaceSiteVisualSitemap(
  workspaceId: string,
): Promise<SiteVisualSitemapOut> {
  return api.get<SiteVisualSitemapOut>(workspacePath(workspaceId, "/site/sitemap/visual"));
}
