import { buildProjectSlug } from "@/lib/project-slug";
import type {
  AdminContentModel,
  AdminContentModelKind,
  CreateAdminContentModelPayload,
  JsonValueInput,
} from "@arclayer/openapi/admin-types";

import type {
  ContentModelsFilters,
  ContentModelsTableQuery,
  ContentModelsTableRow,
  ContentTypeIdentifierState,
  CreateContentTypeFormValues,
} from "./types";

const IDENTIFIER_PATTERN = /^[a-z][A-Za-z0-9]*$/;
export const CONTENT_MODEL_IDENTIFIER_MAX_LENGTH = 64;
export const CONTENT_MODEL_NAME_MAX_LENGTH = 128;
export const CONTENT_MODEL_DESCRIPTION_MAX_LENGTH = 256;
const ACRONYM_IDENTIFIER_BOUNDARY_PATTERN = /([A-Z]+)([A-Z][a-z])/g;
const CAMEL_IDENTIFIER_BOUNDARY_PATTERN = /([a-z0-9])([A-Z])/g;

const IRREGULAR_PLURALS = new Map<string, string>([
  ["category", "categories"],
  ["person", "people"],
]);

export type ContentModelStarterTemplateKey =
  | "blank"
  | "page"
  | "reusableBlock"
  | "landingSection"
  | "contentCollection"
  | "taxonomy";

export function buildContentModelsTableId(projectId: string): string {
  return `project-content-models:${projectId}`;
}

export function createGeneratedIdentifier(value: string): ContentTypeIdentifierState {
  return {
    value: buildContentModelIdentifier(value),
    source: "generated",
  };
}

export function createManualIdentifier(value: string): ContentTypeIdentifierState {
  return {
    value: buildContentModelIdentifier(value),
    source: "manual",
  };
}

function decapitalize(value: string): string {
  if (!value) return "";
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function capitalize(value: string): string {
  if (!value) return "";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function readIdentifierWords(value: string): string[] {
  const separatedSeed = value
    .replace(ACRONYM_IDENTIFIER_BOUNDARY_PATTERN, "$1 $2")
    .replace(CAMEL_IDENTIFIER_BOUNDARY_PATTERN, "$1 $2");
  return buildProjectSlug(separatedSeed).split("-").filter(Boolean);
}

export function buildContentModelIdentifier(value: string): string {
  const words = readIdentifierWords(value);
  if (words.length === 0) return "";
  const [first = "", ...rest] = words;
  const raw = [decapitalize(first), ...rest.map(capitalize)]
    .join("")
    .slice(0, CONTENT_MODEL_IDENTIFIER_MAX_LENGTH);
  return decapitalize(raw.replace(/^[^A-Za-z]+/, ""));
}

export function toContentTypeIdentifierSeed(name: string): string {
  return buildContentModelIdentifier(name);
}

export function pluralizeContentTypeIdentifier(singularKey: string): string {
  if (!singularKey) return "";
  const irregular = IRREGULAR_PLURALS.get(singularKey);
  if (irregular) return irregular;
  if (singularKey.endsWith("y") && !/[aeiou]y$/.test(singularKey)) {
    return `${singularKey.slice(0, -1)}ies`;
  }
  if (
    singularKey.endsWith("s") ||
    singularKey.endsWith("x") ||
    singularKey.endsWith("z") ||
    singularKey.endsWith("ch") ||
    singularKey.endsWith("sh")
  ) {
    return `${singularKey}es`;
  }
  return `${singularKey}s`;
}

export function syncGeneratedIdentifiersWithName(
  current: CreateContentTypeFormValues,
  nextName: string,
): CreateContentTypeFormValues {
  const singularSeed = toContentTypeIdentifierSeed(nextName);
  const pluralSeed = pluralizeContentTypeIdentifier(singularSeed);
  return {
    ...current,
    name: nextName,
    singularKey:
      current.singularKey.source === "generated"
        ? createGeneratedIdentifier(singularSeed)
        : current.singularKey,
    pluralKey:
      current.pluralKey.source === "generated"
        ? createGeneratedIdentifier(pluralSeed)
        : current.pluralKey,
  };
}

export function validateContentTypeIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}

export function buildCreateContentTypePayload(values: {
  name: string;
  singularKey: string;
  pluralKey: string;
  description: string | null;
  modelKind: AdminContentModelKind;
  starterTemplate?: ContentModelStarterTemplateKey;
}): CreateAdminContentModelPayload {
  if (values.starterTemplate && values.starterTemplate !== "blank") {
    return buildStarterTemplatePayload(values);
  }

  const isComponent = values.modelKind === "component";
  return {
    name: values.name,
    singularKey: values.singularKey,
    pluralKey: values.pluralKey,
    description: values.description,
    modelKind: values.modelKind,
    fields: [],
    relations: [],
    capabilities: isComponent ? [] : ["queryable"],
    routing: { mode: "none" },
    workflow: { states: ["draft"], initialState: "draft" },
    views: [],
  };
}

function withModelIdentity(
  payload: CreateAdminContentModelPayload,
  values: {
    name: string;
    singularKey: string;
    pluralKey: string;
    description: string | null;
  },
): CreateAdminContentModelPayload {
  return {
    ...payload,
    name: values.name,
    singularKey: values.singularKey,
    pluralKey: values.pluralKey,
    description: values.description,
  };
}

function buildStarterTemplatePayload(values: {
  name: string;
  singularKey: string;
  pluralKey: string;
  description: string | null;
  modelKind: AdminContentModelKind;
  starterTemplate?: ContentModelStarterTemplateKey;
}): CreateAdminContentModelPayload {
  switch (values.starterTemplate) {
    case "page":
      return withModelIdentity(buildSitePageContentModelPayload(), values);
    case "reusableBlock":
      return withModelIdentity(buildReusableBlockContentModelPayload(), values);
    case "landingSection":
      return withModelIdentity(buildLandingSectionTemplatePayload(), values);
    case "contentCollection":
      return withModelIdentity(buildContentCollectionTemplatePayload(), values);
    case "taxonomy":
      return withModelIdentity(buildTaxonomyTemplatePayload(), values);
    case "blank":
    case undefined:
      break;
  }

  return buildCreateContentTypePayload({ ...values, starterTemplate: "blank" });
}

function buildLandingSectionTemplatePayload(): CreateAdminContentModelPayload {
  return {
    singularKey: "landingSection",
    pluralKey: "landingSections",
    name: "Landing Section",
    description:
      "Visual landing-page section contract for hero, proof, feature, CTA, and FAQ blocks.",
    category: "site_builder",
    modelKind: "component",
    defaultEditor: "visual",
    defaultRole: "reusable-section",
    defaultPosture: "composition",
    defaultSurface: "canvas",
    capabilities: ["versioned", "visual_editable", "has_slots", "localizable"],
    fields: [
      { key: "title", label: "Title", scalar: "text", required: true },
      { key: "sectionKey", label: "Section key", scalar: "text", required: true },
      { key: "headline", label: "Headline", scalar: "text", required: false },
      { key: "body", label: "Body", scalar: "long_text", required: false },
      { key: "mediaAssetId", label: "Media asset", scalar: "text", required: false },
      { key: "ctaLabel", label: "CTA label", scalar: "text", required: false },
      { key: "ctaHref", label: "CTA link", scalar: "text", required: false },
      { key: "variant", label: "Variant", scalar: "text", required: false },
    ],
    relations: [],
    routing: { mode: "none" },
    workflow: { states: ["draft", "published"], initialState: "draft" },
    views: [],
    presentation: { allowedKinds: ["form_data", "visual_blueprint", "slot_mapping"] },
    starterPackPolicy: { mode: "section" },
    surfacePolicy: { allowedSurfaces: ["canvas", "structured"] },
  };
}

function buildContentCollectionTemplatePayload(): CreateAdminContentModelPayload {
  return {
    singularKey: "siteRecord",
    pluralKey: "siteRecords",
    name: "Site Records",
    description:
      "Structured website records for case studies, team profiles, resources, or other repeatable site content.",
    category: "content_library",
    modelKind: "collection_type",
    defaultEditor: "form",
    defaultRole: "data",
    defaultPosture: "structured",
    defaultSurface: "structured",
    capabilities: ["versioned", "queryable", "publishable", "localizable"],
    fields: [
      { key: "title", label: "Title", scalar: "text", required: true },
      { key: "slug", label: "Slug", scalar: "text", required: true },
      { key: "summary", label: "Summary", scalar: "long_text", required: false },
      { key: "body", label: "Body", scalar: "long_text", required: false },
      { key: "imageAssetId", label: "Image asset", scalar: "text", required: false },
    ],
    relations: [],
    routing: { mode: "single", slugField: "slug" },
    workflow: { states: ["draft", "published"], initialState: "draft" },
    views: [
      {
        key: "records",
        label: "Records",
        type: "table",
        config: { columns: ["title", "slug"] },
      },
    ],
    presentation: { allowedKinds: ["form_data", "seo"] },
    seo: { titleField: "title", descriptionField: "summary" },
    starterPackPolicy: { mode: "custom" },
    surfacePolicy: { allowedSurfaces: ["structured"] },
  };
}

function buildTaxonomyTemplatePayload(): CreateAdminContentModelPayload {
  return {
    singularKey: "category",
    pluralKey: "categories",
    name: "Category",
    description: "Taxonomy model for grouping pages, reusable blocks, and website records.",
    category: "content_library",
    modelKind: "collection_type",
    defaultEditor: "form",
    defaultRole: "taxonomy",
    defaultPosture: "structured",
    defaultSurface: "structured",
    capabilities: ["versioned", "queryable", "has_relations", "publishable", "localizable"],
    fields: [
      { key: "name", label: "Name", scalar: "text", required: true },
      { key: "slug", label: "Slug", scalar: "text", required: true },
      { key: "description", label: "Description", scalar: "long_text", required: false },
    ],
    relations: [],
    routing: { mode: "single", slugField: "slug" },
    workflow: { states: ["draft", "published"], initialState: "draft" },
    views: [
      {
        key: "categories",
        label: "Categories",
        type: "table",
        config: { columns: ["name", "slug"] },
      },
    ],
    presentation: { allowedKinds: ["form_data", "seo"] },
    seo: { titleField: "name", descriptionField: "description" },
    starterPackPolicy: { mode: "category" },
    surfacePolicy: { allowedSurfaces: ["structured"] },
  };
}

export function isSitePageContentModel(
  model: Pick<AdminContentModel, "capabilities" | "singularKey">,
): boolean {
  return model.singularKey === "page" || model.capabilities.includes("routable");
}

export function isReusableBlockContentModel(
  model: Pick<AdminContentModel, "defaultPosture" | "defaultRole" | "singularKey">,
): boolean {
  return (
    model.singularKey === "reusableBlock" ||
    model.singularKey === "reusable-section" ||
    model.defaultRole === "reusable-section" ||
    model.defaultPosture === "composition"
  );
}

export function getContentModelPurposeLabelKey(model: AdminContentModel): string {
  if (isSitePageContentModel(model)) return "content:CONTENT_MODELS_PURPOSE_PAGE_MODEL";
  if (isReusableBlockContentModel(model)) return "content:CONTENT_MODELS_PURPOSE_REUSABLE_BLOCK";
  if (model.category === "site_builder") return "content:CONTENT_MODELS_PURPOSE_SITE_BUILDER";
  if (model.modelKind === "single_type") return "content:CONTENT_MODELS_PURPOSE_GLOBAL_DOCUMENT";
  if (model.modelKind === "component") return "content:CONTENT_MODELS_PURPOSE_REUSABLE_BLOCK";
  return "content:CONTENT_MODELS_PURPOSE_CONTENT_COLLECTION";
}

export function buildSitePageContentModelPayload(): CreateAdminContentModelPayload {
  return {
    singularKey: "page",
    pluralKey: "pages",
    name: "Page",
    description: "Route-owned pages for the website editor, preview, SEO, and releases.",
    category: "site_builder",
    modelKind: "collection_type",
    defaultEditor: "visual",
    defaultRole: "page",
    defaultPosture: "page",
    defaultSurface: "canvas",
    capabilities: [
      "versioned",
      "queryable",
      "routable",
      "treeable",
      "visual_editable",
      "has_slots",
      "publishable",
      "seo_managed",
    ],
    fields: [
      { key: "title", label: "Title", scalar: "text", required: true },
      { key: "path", label: "Path", scalar: "text", required: true },
      { key: "routePattern", label: "Route pattern", scalar: "text", required: false },
      { key: "heroHeadline", label: "Hero headline", scalar: "text", required: false },
      { key: "heroSubheading", label: "Hero subheading", scalar: "long_text", required: false },
      { key: "sections", label: "Sections", scalar: "json", required: false },
    ],
    relations: [],
    routing: { mode: "localized", slugField: "path" },
    workflow: { states: ["draft", "published"], initialState: "draft" },
    views: [
      {
        key: "pages",
        label: "Pages",
        type: "table",
        config: { columns: ["title", "path"] },
      },
    ],
    presentation: { allowedKinds: ["form_data", "visual_blueprint", "slot_mapping", "seo"] },
    seo: { titleField: "title" },
    starterPackPolicy: { mode: "page" },
    surfacePolicy: { allowedSurfaces: ["canvas", "structured"] },
  };
}

export function buildReusableBlockContentModelPayload(): CreateAdminContentModelPayload {
  return {
    singularKey: "reusableBlock",
    pluralKey: "reusableBlocks",
    name: "Reusable Block",
    description:
      "Reusable visual block for page sections, layout fragments, and AI-assisted composition.",
    category: "site_builder",
    modelKind: "collection_type",
    defaultEditor: "visual",
    defaultRole: "reusable-section",
    defaultPosture: "composition",
    defaultSurface: "canvas",
    capabilities: [
      "versioned",
      "queryable",
      "visual_editable",
      "has_slots",
      "publishable",
      "localizable",
    ],
    fields: [
      { key: "title", label: "Title", scalar: "text", required: true },
      { key: "sectionKey", label: "Section key", scalar: "text", required: true },
      { key: "propsDefaults", label: "Props defaults", scalar: "json", required: false },
    ],
    relations: [],
    routing: { mode: "none" },
    workflow: { states: ["draft", "published"], initialState: "draft" },
    views: [
      {
        key: "blocks",
        label: "Reusable blocks",
        type: "table",
        config: { columns: ["title", "sectionKey"] },
      },
    ],
    presentation: { allowedKinds: ["form_data", "visual_blueprint", "slot_mapping"] },
    starterPackPolicy: { mode: "section" },
    surfacePolicy: { allowedSurfaces: ["canvas", "structured"] },
  };
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type ContentModelFieldScalar = NonNullable<
  CreateAdminContentModelPayload["fields"]
>[number]["scalar"];
type ContentModelRelationType = NonNullable<
  CreateAdminContentModelPayload["relations"]
>[number]["relation"];
type ContentModelViewType = NonNullable<CreateAdminContentModelPayload["views"]>[number]["type"];
type ContentWorkflowDefinition = NonNullable<CreateAdminContentModelPayload["workflow"]>;
type ContentWorkflowStage = NonNullable<ContentWorkflowDefinition["stages"]>[number];
type ContentWorkflowRoleCode = "owner" | "editor" | "viewer";
type ContentWorkflowTransition = NonNullable<ContentWorkflowDefinition["transitions"]>[number];
type ContentWorkflowActorRule = NonNullable<ContentWorkflowDefinition["stageAssignments"]>[number];

type WorkflowPolicyRecord = {
  states?: unknown;
  initialState?: unknown;
  initial_state?: unknown;
  stages?: unknown;
  initialStage?: unknown;
  initial_stage?: unknown;
  publishStage?: unknown;
  publish_stage?: unknown;
  transitions?: unknown;
  stageAssignments?: unknown;
  stage_assignments?: unknown;
  stagePermissions?: unknown;
  stage_permissions?: unknown;
};

type RoutingPolicyRecord = {
  mode?: unknown;
  slugField?: unknown;
  slug_field?: unknown;
};

type FieldSchemaRecord = {
  label?: unknown;
  scalar?: unknown;
  required?: unknown;
  config?: unknown;
};

type RelationSchemaRecord = {
  relation?: unknown;
  targetModelKey?: unknown;
  target_model_key?: unknown;
  required?: unknown;
  config?: unknown;
};

type ViewSchemaRecord = {
  key?: unknown;
  label?: unknown;
  type?: unknown;
  config?: unknown;
};

type ViewSchemaContainer = {
  views?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

const WORKFLOW_STAGE_SET: ReadonlySet<ContentWorkflowStage> = new Set([
  "drafting",
  "in_review",
  "changes_requested",
  "approved",
]);
const WORKFLOW_ROLE_CODE_SET: ReadonlySet<ContentWorkflowRoleCode> = new Set([
  "owner",
  "editor",
  "viewer",
]);

function isWorkflowStage(value: unknown): value is ContentWorkflowStage {
  return WORKFLOW_STAGE_SET.has(value as ContentWorkflowStage);
}

function asWorkflowStage(value: unknown): ContentWorkflowStage | undefined {
  return isWorkflowStage(value) ? value : undefined;
}

function asWorkflowRoleCode(value: unknown): value is ContentWorkflowRoleCode {
  return WORKFLOW_ROLE_CODE_SET.has(value as ContentWorkflowRoleCode);
}

function asWorkflowTransitions(value: unknown): ContentWorkflowTransition[] {
  return asArray<unknown>(value).flatMap((item) => {
    const record = asRecord(item);
    const fromStage = asWorkflowStage(record?.fromStage ?? record?.from_stage);
    const toStage = asWorkflowStage(record?.toStage ?? record?.to_stage);
    return fromStage && toStage ? [{ fromStage, toStage }] : [];
  });
}

function asWorkflowActorRules(value: unknown): ContentWorkflowActorRule[] {
  return asArray<unknown>(value).flatMap((item) => {
    const record = asRecord(item);
    const stage = asWorkflowStage(record?.stage);
    if (!stage) return [];
    const roleCodes = asArray<unknown>(record?.roleCodes ?? record?.role_codes).filter(
      asWorkflowRoleCode,
    );
    const userIds = asArray<unknown>(record?.userIds ?? record?.user_ids).filter(
      (userId): userId is string => typeof userId === "string" && userId.trim().length > 0,
    );
    return roleCodes.length || userIds.length ? [{ stage, roleCodes, userIds }] : [];
  });
}

function trimToLength(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength).trimEnd();
}

function appendIdentifierSuffix(value: string, suffix: string): string {
  const normalized = buildContentModelIdentifier(value) || "model";
  const joinedSuffix = capitalize(buildContentModelIdentifier(suffix) || "copy");
  const nextBase = normalized
    .slice(0, Math.max(1, CONTENT_MODEL_IDENTIFIER_MAX_LENGTH - joinedSuffix.length))
    .replace(/[^A-Za-z0-9]+$/g, "");
  return `${nextBase}${joinedSuffix}`;
}

export function buildDuplicateContentModelName(name: string, t: TranslateFn): string {
  const baseName = trimToLength(name || "Untitled model", CONTENT_MODEL_NAME_MAX_LENGTH);
  const duplicateSuffixLabel = t("content:CONTENT_MODELS_DUPLICATE_NAME_SUFFIX");
  const duplicateSuffix =
    duplicateSuffixLabel === "content:CONTENT_MODELS_DUPLICATE_NAME_SUFFIX"
      ? "Copy"
      : duplicateSuffixLabel;
  const localized = t("content:CONTENT_MODELS_DUPLICATE_NAME_FORMAT", {
    name: baseName,
    suffix: duplicateSuffix,
  });
  const fallback = `${baseName} (${duplicateSuffix})`;
  return trimToLength(
    localized === "content:CONTENT_MODELS_DUPLICATE_NAME_FORMAT" ? fallback : localized,
    CONTENT_MODEL_NAME_MAX_LENGTH,
  );
}

export function buildDuplicateContentModelIdentifiers(
  model: Pick<AdminContentModel, "singularKey" | "pluralKey">,
  existingModels: Pick<AdminContentModel, "singularKey" | "pluralKey">[],
): { singularKey: string; pluralKey: string } {
  const usedIdentifiers = new Set(
    existingModels.flatMap((entry) =>
      [entry.singularKey, entry.pluralKey]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );

  for (let index = 0; index < 200; index += 1) {
    const suffix = index === 0 ? "copy" : `copy-${index + 1}`;
    const singularKey = appendIdentifierSuffix(model.singularKey, suffix);
    const pluralKey = appendIdentifierSuffix(model.pluralKey, suffix);
    if (!usedIdentifiers.has(singularKey) && !usedIdentifiers.has(pluralKey)) {
      return { singularKey, pluralKey };
    }
  }

  throw new Error("CONTENT_MODELS_DUPLICATE_IDENTIFIER_EXHAUSTED");
}

function toFieldContracts(model: AdminContentModel): CreateAdminContentModelPayload["fields"] {
  const fieldSchema = asRecord(model.fieldSchema);
  if (!fieldSchema) return [];

  return Object.entries(fieldSchema).flatMap(([key, rawValue]) => {
    const value = asRecord(rawValue) as FieldSchemaRecord | null;
    const scalar = asString(value?.scalar);
    const label = asString(value?.label);
    if (!scalar || !label) return [];
    const config = (asRecord(value?.config) as Record<string, JsonValueInput> | null) ?? undefined;
    return [
      {
        key,
        label,
        scalar: scalar as ContentModelFieldScalar,
        required: Boolean(value?.required),
        ...(config ? { config } : {}),
      },
    ];
  });
}

function toRelationContracts(
  model: AdminContentModel,
): CreateAdminContentModelPayload["relations"] {
  const relationSchema = asRecord(model.relationSchema);
  if (!relationSchema) return [];

  return Object.entries(relationSchema).flatMap(([key, rawValue]) => {
    const value = asRecord(rawValue) as RelationSchemaRecord | null;
    const relation = asString(value?.relation);
    const targetModelKey = asString(value?.targetModelKey ?? value?.target_model_key);
    if (!relation || !targetModelKey) return [];
    const config = (asRecord(value?.config) as Record<string, JsonValueInput> | null) ?? undefined;
    return [
      {
        key,
        relation: relation as ContentModelRelationType,
        targetModelKey,
        required: Boolean(value?.required),
        ...(config ? { config } : {}),
      },
    ];
  });
}

function toViewContracts(model: AdminContentModel): CreateAdminContentModelPayload["views"] {
  const viewSchema = asRecord(model.viewSchema) as ViewSchemaContainer | null;
  if (!viewSchema) return [];

  return asArray<unknown>(viewSchema.views).flatMap((rawValue) => {
    const value = asRecord(rawValue) as ViewSchemaRecord | null;
    const key = asString(value?.key);
    const label = asString(value?.label);
    const type = asString(value?.type);
    if (!key || !label || !type) return [];
    const config = (asRecord(value?.config) as Record<string, JsonValueInput> | null) ?? undefined;
    return [
      {
        key,
        label,
        type: type as ContentModelViewType,
        ...(config ? { config } : {}),
      },
    ];
  });
}

function toRoutingContract(model: AdminContentModel): CreateAdminContentModelPayload["routing"] {
  const routingSchema = (asRecord(model.routingSchema) as RoutingPolicyRecord | null) ?? {};
  const mode = asString(routingSchema.mode);
  const slugField = asString(routingSchema.slugField ?? routingSchema.slug_field);
  return {
    mode: mode === "single" || mode === "localized" ? mode : "none",
    ...(slugField ? { slugField } : {}),
  };
}

function toWorkflowContract(model: AdminContentModel): CreateAdminContentModelPayload["workflow"] {
  const workflowPolicy = (asRecord(model.workflowPolicy) as WorkflowPolicyRecord | null) ?? {};
  const states = asArray<unknown>(workflowPolicy.states).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const initialState = asString(workflowPolicy.initialState ?? workflowPolicy.initial_state);
  const stages = asArray<unknown>(workflowPolicy.stages).filter(isWorkflowStage);
  const initialStage = asWorkflowStage(workflowPolicy.initialStage ?? workflowPolicy.initial_stage);
  const publishStage = asWorkflowStage(workflowPolicy.publishStage ?? workflowPolicy.publish_stage);
  const transitions = asWorkflowTransitions(workflowPolicy.transitions);
  const stageAssignments = asWorkflowActorRules(
    workflowPolicy.stageAssignments ?? workflowPolicy.stage_assignments,
  );
  const stagePermissions = asWorkflowActorRules(
    workflowPolicy.stagePermissions ?? workflowPolicy.stage_permissions,
  );

  return {
    states,
    ...(initialState ? { initialState } : {}),
    ...(stages.length ? { stages } : {}),
    ...(initialStage ? { initialStage } : {}),
    ...(publishStage ? { publishStage } : {}),
    ...(transitions.length ? { transitions } : {}),
    ...(stageAssignments.length ? { stageAssignments } : {}),
    ...(stagePermissions.length ? { stagePermissions } : {}),
  };
}

function asJsonInputRecord(value: unknown): Record<string, JsonValueInput> | null {
  return asRecord(value) as Record<string, JsonValueInput> | null;
}

function readSeoPolicy(model: AdminContentModel): Record<string, JsonValueInput> | null {
  const contractRegistry = asRecord(model.contractRegistry);
  const deliveryPolicy = asRecord(contractRegistry?.deliveryPolicy);
  return asJsonInputRecord(deliveryPolicy?.seo);
}

export function buildDuplicateContentModelPayload(params: {
  model: AdminContentModel;
  existingModels: AdminContentModel[];
  t: TranslateFn;
}): CreateAdminContentModelPayload {
  const identifiers = buildDuplicateContentModelIdentifiers(params.model, params.existingModels);

  return {
    singularKey: identifiers.singularKey,
    pluralKey: identifiers.pluralKey,
    name: buildDuplicateContentModelName(params.model.name, params.t),
    description: params.model.description ?? null,
    category: params.model.category,
    modelKind: params.model.modelKind,
    defaultEditor: params.model.defaultEditor,
    ...(params.model.defaultRole ? { defaultRole: params.model.defaultRole } : {}),
    ...(params.model.defaultPosture ? { defaultPosture: params.model.defaultPosture } : {}),
    ...(params.model.defaultSurface ? { defaultSurface: params.model.defaultSurface } : {}),
    fields: toFieldContracts(params.model),
    relations: toRelationContracts(params.model),
    capabilities: params.model.capabilities,
    routing: toRoutingContract(params.model),
    workflow: toWorkflowContract(params.model),
    views: toViewContracts(params.model),
    ...(asJsonInputRecord(params.model.presentationSchema)
      ? { presentation: asJsonInputRecord(params.model.presentationSchema) }
      : {}),
    ...(readSeoPolicy(params.model) ? { seo: readSeoPolicy(params.model) } : {}),
    ...(asJsonInputRecord(params.model.starterPackPolicy)
      ? { starterPackPolicy: asJsonInputRecord(params.model.starterPackPolicy) }
      : {}),
    ...(asJsonInputRecord(params.model.surfacePolicy)
      ? { surfacePolicy: asJsonInputRecord(params.model.surfacePolicy) }
      : {}),
  };
}

export function toContentModelsTableQuery(filters: ContentModelsFilters): ContentModelsTableQuery {
  return {
    category: filters.category,
    model_kind: filters.modelKind,
    system_managed:
      filters.systemManaged === "yes" ? true : filters.systemManaged === "no" ? false : undefined,
  };
}

export function getContentModelFieldCount(model: ContentModelsTableRow): number {
  const boundaries = model.contractRegistry?.boundaries;
  const boundaryCount =
    (boundaries?.customFields?.length ?? 0) + (boundaries?.systemFields?.length ?? 0);
  if (boundaryCount > 0) return boundaryCount;
  return model.fieldSchema ? Object.keys(model.fieldSchema).length : 0;
}
