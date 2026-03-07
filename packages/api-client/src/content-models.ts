export type ContentModelCategory = "site_builder" | "content_library" | "system" | "custom";

export type ContentModelCapability =
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

export type ContentDefaultEditor = "form" | "visual" | "rich_text" | "table";

export type ContentModelSummary = {
  id: string;
  workspaceId: string;
  siteId: string;
  key: string;
  name: string;
  description?: string | null;
  category: ContentModelCategory;
  capabilities: ContentModelCapability[];
  defaultEditor: ContentDefaultEditor;
  fieldSchema?: Record<string, unknown> | null;
  relationSchema?: Record<string, unknown> | null;
  routingSchema?: Record<string, unknown> | null;
  presentationSchema?: Record<string, unknown> | null;
  workflowPolicy?: Record<string, unknown> | null;
  viewSchema?: Record<string, unknown> | null;
};
