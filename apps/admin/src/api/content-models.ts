import { api } from "@/lib/http";
import type {
  ContentDefaultEditor,
  ContentFieldScalar,
  ContentModelCapability,
  ContentModelCategory,
  ContentModelDefinitionInput,
  ContentModelFieldDefinition,
  ContentModelRelationDefinition,
  ContentModelRoutingDefinition,
  ContentModelSummary,
  ContentModelViewDefinition,
  ContentModelWorkflowDefinition,
} from "@celestial/api-client";
export type {
  ContentDefaultEditor,
  ContentFieldScalar,
  ContentModelCapability,
  ContentModelCategory,
  ContentModelDefinitionInput,
  ContentModelFieldDefinition,
  ContentModelRelationDefinition,
  ContentModelRoutingDefinition,
  ContentModelSummary,
  ContentModelViewDefinition,
  ContentModelWorkflowDefinition,
} from "@celestial/api-client";
import type { PageData } from "@/types/api";

export type CreateContentModelInput = {
  key: string;
  name: string;
  category?: ContentModelCategory;
  description?: string | null;
  capabilities?: ContentModelCapability[];
  defaultEditor?: ContentDefaultEditor;
  fieldSchema?: Record<string, unknown> | null;
  relationSchema?: Record<string, unknown> | null;
  routingSchema?: Record<string, unknown> | null;
  presentationSchema?: Record<string, unknown> | null;
  workflowPolicy?: Record<string, unknown> | null;
  viewSchema?: Record<string, unknown> | null;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asScalar(value: unknown): ContentFieldScalar | null {
  if (
    value === "text" ||
    value === "long_text" ||
    value === "number" ||
    value === "boolean" ||
    value === "date_time" ||
    value === "json"
  ) {
    return value;
  }
  if (value === "longText") return "long_text";
  if (value === "dateTime") return "date_time";
  return null;
}

function buildFieldDefinitions(
  fieldSchema: CreateContentModelInput["fieldSchema"],
): ContentModelFieldDefinition[] {
  const fields = Array.isArray(fieldSchema?.fields) ? fieldSchema.fields : [];
  return fields.flatMap((field) => {
    const record = asRecord(field);
    const scalar = asScalar(record?.scalar ?? record?.type);
    const key = typeof record?.key === "string" ? record.key.trim() : "";
    const label = typeof record?.label === "string" ? record.label.trim() : "";
    if (!record || !scalar || !key || !label) return [];
    return [
      {
        key,
        label,
        scalar,
        ...(record.required === true ? { required: true } : {}),
        ...(asRecord(record.config) ? { config: asRecord(record.config) } : {}),
      },
    ];
  });
}

function buildRelationDefinitions(
  relationSchema: CreateContentModelInput["relationSchema"],
): ContentModelRelationDefinition[] {
  const relations = asRecord(relationSchema);
  if (!relations) return [];
  return Object.entries(relations).flatMap(([relationKey, relation]) => {
    const record = asRecord(relation);
    const targetModelKey =
      typeof record?.targetModelKey === "string"
        ? record.targetModelKey.trim()
        : typeof record?.target === "string"
          ? record.target.trim()
          : "";
    const relationKind = record?.relation ?? record?.kind;
    if (
      !record ||
      !relationKey.trim() ||
      !targetModelKey ||
      (relationKind !== "one_to_one" &&
        relationKind !== "one_to_many" &&
        relationKind !== "many_to_one" &&
        relationKind !== "many_to_many")
    ) {
      return [];
    }
    return [
      {
        key: relationKey.trim(),
        relation: relationKind,
        targetModelKey,
        ...(record.required === true ? { required: true } : {}),
        ...(asRecord(record.config) ? { config: asRecord(record.config) } : {}),
      },
    ];
  });
}

function buildRoutingDefinition(
  routingSchema: CreateContentModelInput["routingSchema"],
): ContentModelRoutingDefinition {
  const routing = asRecord(routingSchema);
  if (!routing) return { mode: "none" };
  const mode = routing.mode;
  if (mode === "single" || mode === "localized" || mode === "none") {
    return {
      mode,
      slugField: typeof routing.slugField === "string" ? routing.slugField.trim() : null,
    };
  }
  if (mode === "slug_only") {
    return {
      mode: "single",
      slugField: typeof routing.slugField === "string" ? routing.slugField.trim() : "slug",
    };
  }
  return { mode: "none" };
}

function buildWorkflowDefinition(
  workflowPolicy: CreateContentModelInput["workflowPolicy"],
): ContentModelWorkflowDefinition {
  const workflow = asRecord(workflowPolicy);
  if (!workflow) return { states: [] };
  const states = Array.isArray(workflow.states)
    ? workflow.states.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )
    : [];
  const initialState =
    typeof workflow.initialState === "string" && workflow.initialState.trim()
      ? workflow.initialState.trim()
      : null;
  if (workflow.supportsSchedule === true && states.length === 0) {
    return { states: ["draft", "scheduled", "published"], initialState: "draft" };
  }
  return { states, initialState };
}

function normalizeViewType(value: unknown): ContentModelViewDefinition["type"] | null {
  if (
    value === "detail" ||
    value === "list" ||
    value === "table" ||
    value === "grid" ||
    value === "tree"
  ) {
    return value;
  }
  if (value === "board") return "grid";
  return null;
}

function buildViewDefinitions(
  viewSchema: CreateContentModelInput["viewSchema"],
): ContentModelViewDefinition[] {
  const schema = asRecord(viewSchema);
  if (!schema) return [];
  if (Array.isArray(schema.views)) {
    return schema.views.flatMap((view) => {
      const record = asRecord(view);
      const type = normalizeViewType(record?.type);
      const key = typeof record?.key === "string" ? record.key.trim() : "";
      const label = typeof record?.label === "string" ? record.label.trim() : "";
      if (!record || !type || !key || !label) return [];
      return [
        {
          key,
          label,
          type,
          ...(asRecord(record.config) ? { config: asRecord(record.config) } : {}),
        },
      ];
    });
  }
  const defaultView = normalizeViewType(schema.defaultView);
  if (!defaultView) return [];
  return [{ key: "default", label: "Default", type: defaultView }];
}

function buildCreatePayload(input: CreateContentModelInput): ContentModelDefinitionInput {
  return {
    key: input.key,
    name: input.name,
    description: input.description?.trim() || null,
    category: input.category ?? "custom",
    defaultEditor: input.defaultEditor ?? "form",
    capabilities: input.capabilities ?? [],
    fields: buildFieldDefinitions(input.fieldSchema),
    relations: buildRelationDefinitions(input.relationSchema),
    routing: buildRoutingDefinition(input.routingSchema),
    workflow: buildWorkflowDefinition(input.workflowPolicy),
    views: buildViewDefinitions(input.viewSchema),
    presentation: input.presentationSchema ?? null,
    seo: null,
  };
}

export async function listWorkspaceContentModels(
  workspaceId: string,
  params?: { page?: number; size?: number },
): Promise<PageData<ContentModelSummary>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return api.get<PageData<ContentModelSummary>>(
    `/workspaces/${workspaceId}/content/models${query}`,
  );
}

export async function createWorkspaceContentModel(
  workspaceId: string,
  input: CreateContentModelInput,
): Promise<void> {
  await api.post(`/workspaces/${workspaceId}/content/models`, buildCreatePayload(input));
}
