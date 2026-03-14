import type {
  ContentDefaultEditor,
  ContentModelCapability,
  ContentModelCategory,
} from "@celestial/api-client";

import type { CreateContentModelInput } from "@/api/content-models";

export type LegacyContentModelTemplateId =
  | "custom"
  | "page"
  | "post"
  | "author"
  | "testimonial"
  | "pricing_tier"
  | "legal_document"
  | "reusable_block";

export type LegacyContentModelTemplatePreset = Readonly<{
  id: LegacyContentModelTemplateId;
  titleKey: string;
  summaryKey: string;
  descriptionKey: string;
  defaultKey: string;
  category?: ContentModelCategory;
  defaultEditor?: ContentDefaultEditor;
  capabilities?: readonly ContentModelCapability[];
  fieldSchema?: Record<string, unknown> | null;
  relationSchema?: Record<string, unknown> | null;
  routingSchema?: Record<string, unknown> | null;
  presentationSchema?: Record<string, unknown> | null;
  workflowPolicy?: Record<string, unknown> | null;
  viewSchema?: Record<string, unknown> | null;
}>;

type TranslateFn = (key: string) => string;

function createFieldSchema(fields: Array<{ key: string; label: string; type: string }>) {
  return { version: 1, fields };
}

const TABLE_VIEW = { defaultView: "table" } as const;

export const LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS: readonly LegacyContentModelTemplatePreset[] = [
  {
    id: "custom",
    titleKey: "content_library:MODELS_TEMPLATE_CUSTOM_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_CUSTOM_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_CUSTOM_DESCRIPTION",
    defaultKey: "",
  },
  {
    id: "page",
    titleKey: "content_library:MODELS_TEMPLATE_PAGE_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_PAGE_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_PAGE_DESCRIPTION",
    defaultKey: "page",
    category: "site_builder",
    defaultEditor: "visual",
    capabilities: [
      "versioned",
      "routable",
      "treeable",
      "visual_editable",
      "has_slots",
      "has_relations",
      "localizable",
      "publishable",
      "seo_managed",
    ],
    routingSchema: { mode: "static_or_dynamic" },
    presentationSchema: { allowed: ["visual_blueprint", "slot_mapping", "seo"] },
  },
  {
    id: "post",
    titleKey: "content_library:MODELS_TEMPLATE_POST_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_POST_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_POST_DESCRIPTION",
    defaultKey: "post",
    category: "content_library",
    defaultEditor: "rich_text",
    capabilities: [
      "versioned",
      "routable",
      "rich_text_editable",
      "has_relations",
      "localizable",
      "publishable",
      "seo_managed",
    ],
    fieldSchema: createFieldSchema([
      { key: "excerpt", label: "Excerpt", type: "textarea" },
      { key: "cover_image", label: "Cover image", type: "asset" },
    ]),
    routingSchema: { mode: "slug_only", pattern: "/blog/:slug" },
    presentationSchema: { allowed: ["rich_text_document", "seo"] },
    workflowPolicy: { supportsSchedule: true },
    viewSchema: TABLE_VIEW,
  },
  {
    id: "author",
    titleKey: "content_library:MODELS_TEMPLATE_AUTHOR_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_AUTHOR_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_AUTHOR_DESCRIPTION",
    defaultKey: "author",
    category: "content_library",
    defaultEditor: "form",
    capabilities: [
      "versioned",
      "routable",
      "has_relations",
      "localizable",
      "publishable",
      "seo_managed",
    ],
    fieldSchema: createFieldSchema([
      { key: "display_name", label: "Display name", type: "text" },
      { key: "bio", label: "Bio", type: "rich_text" },
      { key: "avatar", label: "Avatar", type: "asset" },
    ]),
    relationSchema: { posts: { target: "post", kind: "many" } },
    routingSchema: { mode: "slug_only", pattern: "/authors/:slug" },
    presentationSchema: { allowed: ["form_data", "seo"] },
    viewSchema: TABLE_VIEW,
  },
  {
    id: "testimonial",
    titleKey: "content_library:MODELS_TEMPLATE_TESTIMONIAL_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_TESTIMONIAL_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_TESTIMONIAL_DESCRIPTION",
    defaultKey: "testimonial",
    category: "content_library",
    defaultEditor: "form",
    capabilities: ["versioned", "has_relations", "localizable", "publishable"],
    fieldSchema: createFieldSchema([
      { key: "quote", label: "Quote", type: "textarea" },
      { key: "speaker_name", label: "Speaker", type: "text" },
      { key: "speaker_role", label: "Role", type: "text" },
    ]),
    relationSchema: { speaker: { target: "author", kind: "one" } },
    presentationSchema: { allowed: ["form_data"] },
    viewSchema: TABLE_VIEW,
  },
  {
    id: "pricing_tier",
    titleKey: "content_library:MODELS_TEMPLATE_PRICING_TIER_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_PRICING_TIER_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_PRICING_TIER_DESCRIPTION",
    defaultKey: "pricing_tier",
    category: "content_library",
    defaultEditor: "form",
    capabilities: ["versioned", "has_relations", "localizable", "publishable"],
    fieldSchema: createFieldSchema([
      { key: "price", label: "Price", type: "number" },
      { key: "billing_period", label: "Billing period", type: "text" },
      { key: "features", label: "Features", type: "list" },
    ]),
    presentationSchema: { allowed: ["form_data"] },
    viewSchema: TABLE_VIEW,
  },
  {
    id: "legal_document",
    titleKey: "content_library:MODELS_TEMPLATE_LEGAL_DOCUMENT_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_LEGAL_DOCUMENT_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_LEGAL_DOCUMENT_DESCRIPTION",
    defaultKey: "legal_document",
    category: "content_library",
    defaultEditor: "rich_text",
    capabilities: [
      "versioned",
      "routable",
      "rich_text_editable",
      "localizable",
      "publishable",
      "seo_managed",
    ],
    fieldSchema: createFieldSchema([{ key: "summary", label: "Summary", type: "textarea" }]),
    routingSchema: { mode: "slug_only", pattern: "/legal/:slug" },
    presentationSchema: { allowed: ["rich_text_document", "seo"] },
    workflowPolicy: { supportsSchedule: true },
    viewSchema: TABLE_VIEW,
  },
  {
    id: "reusable_block",
    titleKey: "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_TITLE",
    summaryKey: "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_SUMMARY",
    descriptionKey: "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_DESCRIPTION",
    defaultKey: "reusable_block",
    category: "site_builder",
    defaultEditor: "visual",
    capabilities: ["versioned", "visual_editable", "has_slots", "has_relations", "publishable"],
    presentationSchema: { allowed: ["visual_blueprint", "slot_mapping"] },
  },
];

export function getLegacyContentModelTemplatePreset(
  templateId: LegacyContentModelTemplateId,
): LegacyContentModelTemplatePreset {
  const preset = LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS.find(
    (candidate) => candidate.id === templateId,
  );
  if (!preset) {
    throw new Error(`Unknown legacy content model template preset: ${templateId}`);
  }
  return preset;
}

export function buildLegacyCreateContentModelInput(
  preset: LegacyContentModelTemplatePreset,
  translate: TranslateFn,
): CreateContentModelInput {
  const isCustomTemplate = preset.id === "custom";
  return {
    key: preset.defaultKey,
    name: preset.defaultKey ? translate(preset.titleKey) : "",
    fieldSchema: preset.fieldSchema ?? null,
    workflowPolicy: preset.workflowPolicy ?? null,
    ...(isCustomTemplate
      ? {}
      : {
          category: preset.category,
          description: translate(preset.descriptionKey),
          capabilities: preset.capabilities ? [...preset.capabilities] : undefined,
          defaultEditor: preset.defaultEditor,
          relationSchema: preset.relationSchema ?? null,
          routingSchema: preset.routingSchema ?? null,
          presentationSchema: preset.presentationSchema ?? null,
          viewSchema: preset.viewSchema ?? null,
        }),
  };
}
