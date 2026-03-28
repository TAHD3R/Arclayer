export type AdminContentModelCategory = "site_builder" | "content_library" | "system" | "custom";

export type AdminContentModelCapability =
  | "versioned"
  | "routable"
  | "treeable"
  | "visual_editable"
  | "rich_text_editable"
  | "queryable"
  | "has_slots"
  | "has_relations"
  | "localizable"
  | "publishable"
  | "schedulable"
  | "seo_managed";

export type AdminContentModel = {
  id: string;
  workspaceId: string;
  siteId: string;
  key: string;
  name: string;
  description?: string | null;
  category: AdminContentModelCategory;
  capabilities: AdminContentModelCapability[];
  defaultEditor?: "form" | "visual" | "rich_text" | "table";
};

export type AdminContentItemStatus = "draft" | "published" | "archived";
export type AdminContentItemVisibility = "public" | "private";
export type AdminContentBootstrapPresetState = "selected" | "customized" | "none";
export type AdminContentVersionState = "draft" | "published" | "scheduled" | "archived";
export type AdminContentPresentationKind =
  | "form_data"
  | "rich_text_document"
  | "visual_blueprint"
  | "query_definition"
  | "slot_mapping"
  | "seo";
export type AdminContentCapabilityPackId =
  | AdminContentModelCapability
  | "layout_bound"
  | "reusable"
  | "taxonomy_enabled";

export type AdminContentItem = {
  id: string;
  workspaceId: string;
  siteId: string;
  modelId?: string | null;
  modelKey?: string | null;
  slug: string;
  title?: string | null;
  summary?: string | null;
  status: AdminContentItemStatus;
  visibility: AdminContentItemVisibility;
  locale: string;
  bootstrapPresetKey?: string | null;
  bootstrapPresetState: AdminContentBootstrapPresetState;
  capabilityPackIds: AdminContentCapabilityPackId[];
  draftVersion: number;
  publishedVersion?: number | null;
  updatedAt: string;
};

export type CreateAdminContentItemPayload = {
  title: string;
  locale?: string;
};

export type ApplyAdminContentBootstrapShapePayload = {
  presetKey?: string | null;
  presetState: AdminContentBootstrapPresetState;
  capabilityPackIds: AdminContentCapabilityPackId[];
};

export type AdminContentPresentation = {
  kind: AdminContentPresentationKind;
  payload?: Record<string, unknown> | null;
};

export type AdminContentVersion = {
  itemId: string;
  versionNumber: number;
  state: AdminContentVersionState;
  createdAt: string;
  createdByUserId?: string | null;
  lastTransitionByUserId?: string | null;
  fieldsSnapshot: Record<string, unknown>;
  presentations: AdminContentPresentation[];
  changeSummary?: string | null;
};

export type SaveAdminContentDraftVersionPayload = {
  expectedVersion?: number | null;
  changeSummary?: string | null;
  fieldsSnapshot: Record<string, unknown>;
  presentations: AdminContentPresentation[];
};

export type PatchAdminContentVersionPayload = {
  changeSummary?: string | null;
  fieldsSnapshot?: Record<string, unknown>;
  presentations?: AdminContentPresentation[];
};

export type AdminContentSeoProfile = {
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  robotsDirective?: string | null;
  payload?: Record<string, unknown> | null;
};

export type AdminPublishImpact = {
  missingRoutes: string[];
  unresolvedRelations: string[];
  unpublishedDependencies: string[];
};

export type ListAdminContentModelsParams = {
  page?: number;
  size?: number;
};

export type ListAdminContentItemsParams = {
  page?: number;
  size?: number;
  modelKey?: string;
};

export type AdminContentLibraryViewStatus = "published" | "changed" | "draft" | "archived";
export type AdminContentLibraryViewRole =
  | "page"
  | "article"
  | "reusable-section"
  | "taxonomy"
  | "person"
  | "settings"
  | "data"
  | "general";
export type AdminContentLibraryViewEditWith = "canvas" | "writing" | "structured";
export type AdminContentLibraryViewVisibility = "private" | "workspace";
export type AdminContentLibrarySystemViewId =
  | "all"
  | "site-content"
  | "draft"
  | "published"
  | "needs-attention";

export type AdminContentLibraryViewFilters = {
  status?: AdminContentLibraryViewStatus;
  modelKey?: string;
  role?: AdminContentLibraryViewRole;
  editWith?: AdminContentLibraryViewEditWith;
};

export type AdminContentLibraryViewSorting = {
  id: string;
  desc: boolean;
};

export type AdminContentLibraryViewMode = "table" | "card";
export type AdminContentLibraryViewRowHeight = "short" | "medium" | "tall" | "extraTall";

export type AdminContentLibraryViewColumns = {
  visibility?: Record<string, boolean>;
  order?: string[];
  rowHeight?: AdminContentLibraryViewRowHeight;
  wrapHeaders?: boolean;
};

export type AdminContentLibraryView = {
  id: string;
  name: string;
  baseViewId: AdminContentLibrarySystemViewId;
  query: string;
  filters: AdminContentLibraryViewFilters;
  sorting: AdminContentLibraryViewSorting[];
  viewMode?: AdminContentLibraryViewMode;
  columns?: AdminContentLibraryViewColumns;
  visibility: AdminContentLibraryViewVisibility;
  pinned: boolean;
  isDefault: boolean;
};

export type AdminContentLibraryViewsState = {
  items: AdminContentLibraryView[];
  defaultViewId: string | null;
};

export type CreateAdminContentLibraryViewPayload = {
  name: string;
  baseViewId: AdminContentLibrarySystemViewId;
  query: string;
  filters: AdminContentLibraryViewFilters;
  sorting: AdminContentLibraryViewSorting[];
  viewMode?: AdminContentLibraryViewMode;
  columns?: AdminContentLibraryViewColumns;
  visibility: AdminContentLibraryViewVisibility;
  pinned: boolean;
  isDefault: boolean;
};

export type PatchAdminContentLibraryViewPayload = {
  name?: string;
  baseViewId?: AdminContentLibrarySystemViewId;
  query?: string;
  filters?: AdminContentLibraryViewFilters;
  sorting?: AdminContentLibraryViewSorting[];
  viewMode?: AdminContentLibraryViewMode;
  columns?: AdminContentLibraryViewColumns;
  visibility?: AdminContentLibraryViewVisibility;
  pinned?: boolean;
  isDefault?: boolean;
};

export type MoveAdminContentLibraryViewPayload = {
  direction: "up" | "down";
};
