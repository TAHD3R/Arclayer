import type {
  ContentDefaultEditor,
  ContentModelCapability,
  ContentModelCategory,
} from "@celestial/api-client";
import type { CreateContentModelInput } from "@/api/content-models";

import {
  buildLegacyCreateContentModelInput,
  getLegacyContentModelTemplatePreset,
  type LegacyContentModelTemplateId,
} from "./content-model-templates";

type TranslateFn = (key: string) => string;
type JsonRecord = Record<string, unknown>;

export type ModelEditorDraft = {
  starterId?: LegacyContentModelTemplateId;
  name: string;
  key: string;
  category?: ContentModelCategory;
  description: string;
  capabilities: ContentModelCapability[];
  defaultEditor?: ContentDefaultEditor;
  fieldSchemaText: string;
  relationSchemaText: string;
  routingMode: string;
  routingPattern: string;
  defaultView: string;
  workflowSupportsSchedule: boolean;
};

export function createBlankDraft(): ModelEditorDraft {
  return {
    name: "",
    key: "",
    description: "",
    capabilities: [],
    fieldSchemaText: "",
    relationSchemaText: "",
    routingMode: "none",
    routingPattern: "",
    defaultView: "",
    workflowSupportsSchedule: false,
  };
}

function toJsonText(value: unknown): string {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

function parseOptionalJsonObject(input: string, label: string): JsonRecord | null {
  const text = input.trim();
  if (!text) return null;
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as JsonRecord;
}

function extractRoutingMode(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "none";
  const mode = (value as Record<string, unknown>).mode;
  return typeof mode === "string" && mode.trim() ? mode.trim() : "none";
}

function extractRoutingPattern(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const pattern = (value as Record<string, unknown>).pattern;
  return typeof pattern === "string" && pattern.trim() ? pattern.trim() : "";
}

function extractWorkflowSchedule(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>).supportsSchedule === true;
}

function extractDefaultView(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const defaultView = (value as Record<string, unknown>).defaultView;
  return typeof defaultView === "string" && defaultView.trim() ? defaultView.trim() : "";
}

function extractCategory(value: unknown): ContentModelCategory | undefined {
  if (value === "site_builder") return "site_builder";
  if (value === "content_library") return "content_library";
  if (value === "system") return "system";
  if (value === "custom") return "custom";
  return undefined;
}

function extractDefaultEditor(value: unknown): ContentDefaultEditor | undefined {
  if (value === "form") return "form";
  if (value === "visual") return "visual";
  if (value === "rich_text") return "rich_text";
  if (value === "table") return "table";
  return undefined;
}

function extractCapabilities(value: unknown): ContentModelCapability[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ContentModelCapability =>
      item === "versioned" ||
      item === "routable" ||
      item === "treeable" ||
      item === "visual_editable" ||
      item === "rich_text_editable" ||
      item === "queryable" ||
      item === "has_slots" ||
      item === "has_relations" ||
      item === "localizable" ||
      item === "publishable" ||
      item === "schedulable" ||
      item === "seo_managed",
  );
}

export function buildDraftFromStarter(
  starterId: LegacyContentModelTemplateId,
  translate: TranslateFn,
): ModelEditorDraft {
  const preset = getLegacyContentModelTemplatePreset(starterId);
  const model = buildLegacyCreateContentModelInput(preset, translate);

  return {
    starterId,
    name: model.name,
    key: model.key,
    category: extractCategory(model.category),
    description: model.description ?? "",
    capabilities: extractCapabilities(model.capabilities),
    defaultEditor: extractDefaultEditor(model.defaultEditor),
    fieldSchemaText: toJsonText(model.fieldSchema),
    relationSchemaText: toJsonText(model.relationSchema),
    routingMode: extractRoutingMode(model.routingSchema),
    routingPattern: extractRoutingPattern(model.routingSchema),
    defaultView: extractDefaultView(model.viewSchema),
    workflowSupportsSchedule: extractWorkflowSchedule(model.workflowPolicy),
  };
}

export function getStarterLabel(
  starterId: LegacyContentModelTemplateId | undefined,
  translate: TranslateFn,
): string | null {
  if (!starterId) return null;
  return translate(getLegacyContentModelTemplatePreset(starterId).titleKey);
}

export function buildCreateInputFromDraft(draft: ModelEditorDraft): CreateContentModelInput {
  const fieldSchema = parseOptionalJsonObject(draft.fieldSchemaText, "fieldSchema");
  const relationSchema = parseOptionalJsonObject(draft.relationSchemaText, "relationSchema");
  const routingSchema =
    draft.routingMode.trim() && draft.routingMode !== "none"
      ? {
          mode: draft.routingMode.trim(),
          ...(draft.routingPattern.trim() ? { pattern: draft.routingPattern.trim() } : {}),
        }
      : null;
  const viewSchema = draft.defaultView.trim() ? { defaultView: draft.defaultView.trim() } : null;

  return {
    key: draft.key.trim(),
    name: draft.name.trim(),
    ...(draft.category ? { category: draft.category } : {}),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.capabilities.length ? { capabilities: draft.capabilities } : {}),
    ...(draft.defaultEditor ? { defaultEditor: draft.defaultEditor } : {}),
    ...(fieldSchema ? { fieldSchema } : { fieldSchema: null }),
    ...(relationSchema ? { relationSchema } : {}),
    ...(routingSchema ? { routingSchema } : {}),
    ...(viewSchema ? { viewSchema } : {}),
    workflowPolicy: draft.workflowSupportsSchedule ? { supportsSchedule: true } : null,
  };
}

export function getImpactCounts(draft: ModelEditorDraft) {
  return {
    fields: draft.fieldSchemaText.trim() ? 1 : 0,
    relations: draft.relationSchemaText.trim() ? 1 : 0,
    capabilities: draft.capabilities.length,
  };
}
