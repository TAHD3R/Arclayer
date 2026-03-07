import { api } from "@/lib/http";
import type {
  ContentDefaultEditor,
  ContentModelCapability,
  ContentModelCategory,
  ContentModelSummary,
} from "@celestial/api-client";
export type {
  ContentDefaultEditor,
  ContentModelCapability,
  ContentModelCategory,
  ContentModelSummary,
} from "@celestial/api-client";
import type { PageData } from "@/types/api";

export type CreateContentModelInput = {
  key: string;
  name: string;
  kind: "page" | "post" | "template" | "block" | "menu" | "view" | "component" | "custom";
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
  templateKey?: string | null;
};

function buildModelEditorSchema(input: CreateContentModelInput): Record<string, unknown> | null {
  const schema = {
    category: input.category,
    description: input.description?.trim() || undefined,
    capabilities: input.capabilities?.length ? input.capabilities : undefined,
    defaultEditor: input.defaultEditor,
    relationSchema: input.relationSchema ?? undefined,
    routingSchema: input.routingSchema ?? undefined,
    presentationSchema: input.presentationSchema ?? undefined,
    viewSchema: input.viewSchema ?? undefined,
    templateKey: input.templateKey ?? undefined,
  };
  const entries = Object.entries(schema).filter(([, value]) => value !== undefined);
  return entries.length ? Object.fromEntries(entries) : null;
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
  await api.post(`/workspaces/${workspaceId}/content/types`, {
    code: input.key,
    name: input.name,
    kind: input.kind,
    fieldSchema: input.fieldSchema ?? null,
    editorSchema: buildModelEditorSchema(input),
    workflowPolicy: input.workflowPolicy ?? null,
  });
}
