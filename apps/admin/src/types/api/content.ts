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

export type AdminContentItem = {
  id: string;
  workspaceId: string;
  siteId: string;
  modelId: string;
  modelKey: string;
  slug: string;
  title?: string | null;
  status: AdminContentItemStatus;
  visibility: AdminContentItemVisibility;
  locale: string;
  draftVersion: number;
  publishedVersion?: number | null;
  updatedAt: string;
};

export type AdminContentVersion = {
  itemId: string;
  versionNumber: number;
  state: "draft" | "published" | "scheduled" | "archived";
  createdAt: string;
  createdByUserId?: string | null;
  lastTransitionByUserId?: string | null;
  changeSummary?: string | null;
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
