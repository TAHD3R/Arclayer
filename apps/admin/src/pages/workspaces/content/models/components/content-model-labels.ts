import type {
  ContentDefaultEditor,
  ContentModelCapability,
  ContentModelCategory,
} from "@celestial/api-client";

export const CONTENT_MODEL_CATEGORY_LABEL_KEYS: Record<ContentModelCategory, string> = {
  site_builder: "content_library:MODELS_CATEGORY_SITE_BUILDER",
  content_library: "content_library:MODELS_CATEGORY_CONTENT_LIBRARY",
  system: "content_library:MODELS_CATEGORY_SYSTEM",
  custom: "content_library:MODELS_CATEGORY_CUSTOM",
};

export const CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS: Record<ContentDefaultEditor, string> = {
  form: "content_library:MODELS_EDITOR_FORM",
  visual: "content_library:MODELS_EDITOR_VISUAL",
  rich_text: "content_library:MODELS_EDITOR_RICH_TEXT",
  table: "content_library:MODELS_EDITOR_TABLE",
};

export const CONTENT_MODEL_CAPABILITY_LABEL_KEYS: Record<ContentModelCapability, string> = {
  versioned: "content_library:MODELS_CAPABILITY_VERSIONED",
  routable: "content_library:MODELS_CAPABILITY_ROUTABLE",
  treeable: "content_library:MODELS_CAPABILITY_TREEABLE",
  visual_editable: "content_library:MODELS_CAPABILITY_VISUAL_EDITABLE",
  rich_text_editable: "content_library:MODELS_CAPABILITY_RICH_TEXT_EDITABLE",
  queryable: "content_library:MODELS_CAPABILITY_QUERYABLE",
  has_slots: "content_library:MODELS_CAPABILITY_HAS_SLOTS",
  has_relations: "content_library:MODELS_CAPABILITY_HAS_RELATIONS",
  localizable: "content_library:MODELS_CAPABILITY_LOCALIZABLE",
  publishable: "content_library:MODELS_CAPABILITY_PUBLISHABLE",
  schedulable: "content_library:MODELS_CAPABILITY_SCHEDULABLE",
  seo_managed: "content_library:MODELS_CAPABILITY_SEO_MANAGED",
};
