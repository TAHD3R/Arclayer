import type { AdminContentModel, CreateAdminContentModelFieldPayload } from "@/types/api";

import type { ContentTypeIdentifierState } from "./types";
import {
  createGeneratedIdentifier,
  createManualIdentifier,
  toContentTypeIdentifierSeed,
} from "./utils";

export type ContentModelFieldTypeId =
  | "rich_text"
  | "short_text"
  | "markdown"
  | "slug"
  | "number"
  | "enumeration"
  | "date_time"
  | "media"
  | "location"
  | "boolean"
  | "json_object"
  | "reference"
  | "component";

export type ContentModelFieldTypeGroupId = "text" | "value_logic" | "time_media" | "structure";

export const CONTENT_MODEL_FIELD_TYPE_GROUPS = [
  {
    id: "text",
    typeIds: ["short_text", "rich_text", "slug"],
  },
  {
    id: "value_logic",
    typeIds: ["number", "boolean", "enumeration"],
  },
  {
    id: "time_media",
    typeIds: ["date_time", "media", "location"],
  },
  {
    id: "structure",
    typeIds: ["reference", "json_object", "component"],
  },
] as const satisfies ReadonlyArray<{
  id: ContentModelFieldTypeGroupId;
  typeIds: readonly ContentModelFieldTypeId[];
}>;

export type ContentModelFieldRow = {
  key: string;
  label: string;
  scalar: CreateAdminContentModelFieldPayload["scalar"];
  required: boolean;
  config: Record<string, unknown> | null;
  locked: boolean;
};

export type ContentModelFieldDraft = {
  typeId: ContentModelFieldTypeId;
  name: string;
  key: ContentTypeIdentifierState;
  description: string;
  required: boolean;
  localizable: boolean;
  numberFormat: "integer" | "decimal";
  numberMin: string;
  numberMax: string;
  mediaMode: "single" | "multiple";
  mediaKind: "image" | "video" | "file";
  booleanDefault: "none" | "true" | "false";
  referenceMode: "single" | "multiple";
  referenceTargetModelKey: string;
};

type FieldConfigRecord = {
  kind?: unknown;
  localizable?: unknown;
};

type FieldSchemaRecord = {
  label?: unknown;
  scalar?: unknown;
  required?: unknown;
  config?: unknown;
};

const DEFAULTS_BY_TYPE: Record<ContentModelFieldTypeId, Partial<ContentModelFieldDraft>> = {
  rich_text: {
    localizable: true,
  },
  short_text: {
    localizable: true,
  },
  markdown: {
    localizable: true,
  },
  slug: {
    localizable: false,
  },
  number: {
    localizable: false,
    numberFormat: "integer",
  },
  enumeration: {
    localizable: false,
  },
  date_time: {
    localizable: false,
  },
  media: {
    localizable: false,
    mediaKind: "image",
    mediaMode: "single",
  },
  location: {
    localizable: false,
  },
  boolean: {
    localizable: false,
    booleanDefault: "none",
  },
  json_object: {
    localizable: false,
  },
  reference: {
    localizable: false,
    referenceMode: "single",
  },
  component: {
    localizable: false,
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumberString(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFieldTypeId(
  scalar: CreateAdminContentModelFieldPayload["scalar"],
  config: FieldConfigRecord | null,
): ContentModelFieldTypeId {
  const kind = asString(config?.kind);
  if (kind === "rich_text") return "rich_text";
  if (kind === "short_text") return "short_text";
  if (kind === "markdown") return "markdown";
  if (kind === "slug") return "slug";
  if (kind === "number") return "number";
  if (kind === "enumeration") return "enumeration";
  if (kind === "date_time") return "date_time";
  if (kind === "media") return "media";
  if (kind === "location") return "location";
  if (kind === "boolean") return "boolean";
  if (kind === "json_object") return "json_object";
  if (kind === "reference") return "reference";
  if (kind === "component") return "component";

  if (scalar === "text") return "short_text";
  if (scalar === "number") return "number";
  if (scalar === "boolean") return "boolean";
  if (scalar === "date_time") return "date_time";
  if (scalar === "long_text") return "rich_text";
  return "json_object";
}

function readFieldRowsFromSchema(model: AdminContentModel): ContentModelFieldRow[] {
  const fieldSchema = asRecord(model.fieldSchema);
  if (!fieldSchema) return [];
  const lockedFieldKeys = new Set(model.contractRegistry?.boundaries?.lockedFieldKeys ?? []);

  return Object.entries(fieldSchema).flatMap(([key, rawValue]) => {
    const value = asRecord(rawValue) as FieldSchemaRecord | null;
    const scalar = asString(value?.scalar);
    const label = asString(value?.label);
    if (!scalar || !label) return [];
    return [
      {
        key,
        label,
        scalar: scalar as CreateAdminContentModelFieldPayload["scalar"],
        required: readBoolean(value?.required),
        config: asRecord(value?.config),
        locked: lockedFieldKeys.has(key),
      },
    ];
  });
}

export function readContentModelFieldRows(model: AdminContentModel): ContentModelFieldRow[] {
  const rows = readFieldRowsFromSchema(model);
  if (rows.length > 0) return rows;

  const boundaries = model.contractRegistry?.boundaries;
  const lockedFieldKeys = new Set(boundaries?.lockedFieldKeys ?? []);
  const fallbackRows = [...(boundaries?.systemFields ?? []), ...(boundaries?.customFields ?? [])];
  return fallbackRows.map((field) => ({
    key: field.key,
    label: field.label,
    scalar: field.scalar,
    required: field.required ?? false,
    config: asRecord(field.config),
    locked: lockedFieldKeys.has(field.key),
  }));
}

export function createContentModelFieldDraft(
  typeId: ContentModelFieldTypeId,
  previous?: Partial<ContentModelFieldDraft>,
): ContentModelFieldDraft {
  return {
    typeId,
    name: previous?.name ?? "",
    key: previous?.key ?? createGeneratedIdentifier(""),
    description: previous?.description ?? "",
    required: previous?.required ?? false,
    localizable: previous?.localizable ?? false,
    numberFormat: previous?.numberFormat ?? "integer",
    numberMin: previous?.numberMin ?? "",
    numberMax: previous?.numberMax ?? "",
    mediaMode: previous?.mediaMode ?? "single",
    mediaKind: previous?.mediaKind ?? "image",
    booleanDefault: previous?.booleanDefault ?? "none",
    referenceMode: previous?.referenceMode ?? "single",
    referenceTargetModelKey: previous?.referenceTargetModelKey ?? "",
    ...DEFAULTS_BY_TYPE[typeId],
  };
}

export function syncContentModelFieldDraftName(
  draft: ContentModelFieldDraft,
  nextName: string,
): ContentModelFieldDraft {
  return {
    ...draft,
    name: nextName,
    key:
      draft.key.source === "generated"
        ? createGeneratedIdentifier(toContentTypeIdentifierSeed(nextName))
        : draft.key,
  };
}

export function updateContentModelFieldDraftKey(
  draft: ContentModelFieldDraft,
  nextKey: string,
): ContentModelFieldDraft {
  return {
    ...draft,
    key: createManualIdentifier(nextKey),
  };
}

function buildFieldScalar(
  typeId: ContentModelFieldTypeId,
): CreateAdminContentModelFieldPayload["scalar"] {
  if (typeId === "short_text" || typeId === "slug" || typeId === "enumeration") return "text";
  if (typeId === "rich_text" || typeId === "markdown") return "long_text";
  if (typeId === "number") return "number";
  if (typeId === "date_time") return "date_time";
  if (typeId === "boolean") return "boolean";
  return "json";
}

export function buildContentModelFieldPayload(
  draft: ContentModelFieldDraft,
): CreateAdminContentModelFieldPayload {
  const config: Record<string, unknown> = {
    kind: draft.typeId,
    localizable: draft.localizable,
  };

  const description = draft.description.trim();
  if (description) {
    config.description = description;
  }

  if (draft.typeId === "rich_text") {
    config.editor = "structured";
  }

  if (draft.typeId === "markdown") {
    config.editor = "markdown";
  }

  if (draft.typeId === "number") {
    config.numberFormat = draft.numberFormat;
    const min = readNumberString(draft.numberMin);
    const max = readNumberString(draft.numberMax);
    if (min !== null) config.min = min;
    if (max !== null) config.max = max;
  }

  if (draft.typeId === "media") {
    config.mediaKind = draft.mediaKind;
    config.mediaMode = draft.mediaMode;
    config.assetScope = "project";
  }

  if (draft.typeId === "boolean" && draft.booleanDefault !== "none") {
    config.defaultValue = draft.booleanDefault === "true";
  }

  if (draft.typeId === "reference") {
    config.referenceMode = draft.referenceMode;
    config.targetModelKey = draft.referenceTargetModelKey;
  }

  return {
    key: draft.key.value.trim(),
    label: draft.name.trim(),
    scalar: buildFieldScalar(draft.typeId),
    required: draft.required,
    config,
  };
}

export function getContentModelFieldTypeLabelKey(typeId: ContentModelFieldTypeId): string {
  return `CONTENT_MODELS_FIELD_TYPE_${typeId.toUpperCase()}_LABEL`;
}

export function getContentModelFieldTypeDescriptionKey(typeId: ContentModelFieldTypeId): string {
  return `CONTENT_MODELS_FIELD_TYPE_${typeId.toUpperCase()}_DESC`;
}

export function getContentModelFieldTypeGroupLabelKey(
  groupId: ContentModelFieldTypeGroupId,
): string {
  return `CONTENT_MODELS_FIELD_TYPE_GROUP_${groupId.toUpperCase()}_LABEL`;
}

export function getContentModelFieldTypeGroupDescriptionKey(
  groupId: ContentModelFieldTypeGroupId,
): string {
  return `CONTENT_MODELS_FIELD_TYPE_GROUP_${groupId.toUpperCase()}_DESC`;
}

export function getContentModelFieldTypeFromRow(
  row: ContentModelFieldRow,
): ContentModelFieldTypeId {
  return readFieldTypeId(row.scalar, row.config as FieldConfigRecord | null);
}

export function isContentModelFieldLocalized(row: ContentModelFieldRow): boolean {
  return readBoolean((row.config as FieldConfigRecord | null)?.localizable);
}
