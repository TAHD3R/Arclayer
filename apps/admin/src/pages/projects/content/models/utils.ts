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
const CONTENT_MODEL_IDENTIFIER_MAX_LENGTH = 64;
const CONTENT_MODEL_NAME_MAX_LENGTH = 128;
const ACRONYM_IDENTIFIER_BOUNDARY_PATTERN = /([A-Z]+)([A-Z][a-z])/g;
const CAMEL_IDENTIFIER_BOUNDARY_PATTERN = /([a-z0-9])([A-Z])/g;

const IRREGULAR_PLURALS = new Map<string, string>([
  ["category", "categories"],
  ["person", "people"],
]);

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
}): CreateAdminContentModelPayload {
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
