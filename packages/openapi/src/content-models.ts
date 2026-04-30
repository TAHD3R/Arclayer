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
export type ContentFieldScalar = "text" | "long_text" | "number" | "boolean" | "date_time" | "json";
export type ContentRelationKind =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many"
  | "one_way"
  | "many_way"
  | "morph_to_one"
  | "morph_to_many"
  | "morph_one"
  | "morph_many";
export type ContentViewType = "detail" | "list" | "table" | "grid" | "tree";

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

export type ContentModelFieldDefinition = {
  key: string;
  label: string;
  scalar: ContentFieldScalar;
  required?: boolean;
  config?: Record<string, unknown> | null;
};

export type ContentModelRelationDefinition = {
  key: string;
  relation: ContentRelationKind;
  targetModelKey: string;
  required?: boolean;
  config?: Record<string, unknown> | null;
};

export type ContentModelRoutingDefinition = {
  mode: "none" | "single" | "localized";
  slugField?: string | null;
};

export type ContentModelWorkflowDefinition = {
  states: string[];
  initialState?: string | null;
  stages?: Array<"drafting" | "in_review" | "changes_requested" | "approved">;
  initialStage?: "drafting" | "in_review" | "changes_requested" | "approved";
  publishStage?: "drafting" | "in_review" | "changes_requested" | "approved";
  transitions?: Array<{
    fromStage: "drafting" | "in_review" | "changes_requested" | "approved";
    toStage: "drafting" | "in_review" | "changes_requested" | "approved";
  }>;
  stageAssignments?: Array<{
    stage: "drafting" | "in_review" | "changes_requested" | "approved";
    roleCodes?: Array<"owner" | "editor" | "viewer">;
    userIds?: string[];
  }>;
  stagePermissions?: Array<{
    stage: "drafting" | "in_review" | "changes_requested" | "approved";
    roleCodes?: Array<"owner" | "editor" | "viewer">;
    userIds?: string[];
  }>;
};

export type ContentModelViewDefinition = {
  key: string;
  label: string;
  type: ContentViewType;
  config?: Record<string, unknown> | null;
};

export type ContentModelDefinitionInput = {
  key: string;
  name: string;
  description?: string | null;
  category?: ContentModelCategory;
  defaultEditor?: ContentDefaultEditor;
  fields?: ContentModelFieldDefinition[];
  relations?: ContentModelRelationDefinition[];
  capabilities?: ContentModelCapability[];
  routing?: ContentModelRoutingDefinition;
  workflow?: ContentModelWorkflowDefinition;
  views?: ContentModelViewDefinition[];
  presentation?: Record<string, unknown> | null;
  seo?: Record<string, unknown> | null;
};
