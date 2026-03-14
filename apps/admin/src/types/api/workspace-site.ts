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

export type WorkspacePublishImpact = {
  missingRoutes: string[];
  unresolvedRelations: string[];
  unpublishedDependencies: string[];
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

export type SitePageUserSummary = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
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
  title?: string | null;
  status?: string;
  visibility?: string;
  locale?: string;
  path?: string | null;
  updatedAt?: string;
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
  title?: string | null;
  visibility?: "public" | "private";
  locale?: string;
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

export type SiteRouteTemplate = {
  id: string;
  siteId: string;
  pathPattern: string;
  entryTypeId: string;
  entryTypeCode: string;
  templatePageRevisionId?: string | null;
  isActive: boolean;
};

export type SiteRouteTemplateCreateIn = {
  pathPattern: string;
  entryTypeCode: string;
  templatePageRevisionId?: string | null;
  isActive?: boolean;
};

export type SiteRouteTemplateUpdateIn = Partial<SiteRouteTemplateCreateIn>;

export type SiteRouteTemplateDeleteOut = {
  templateId: string;
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
