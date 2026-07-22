import type {
  BuilderWireframeSectionConfigureOperationV1Input,
  ComponentCatalogComponentV1,
  ComponentCatalogSlotV1,
  JsonValueInput,
  WireframeSectionV1Output,
} from "@arclayer/openapi";

export type ConfigureBinding = NonNullable<
  BuilderWireframeSectionConfigureOperationV1Input["bindings"]
>[number];
export type BindingKind = "none" | "field" | "literal";

export interface BindingDraft {
  readonly kind: BindingKind;
  readonly value: string;
}

export interface CompositionError {
  readonly messageKey: string;
  readonly slotKey?: string;
}

export function parseBindings(input: {
  component: ComponentCatalogComponentV1;
  requiredSlotKeys: ReadonlySet<string>;
  drafts: Record<string, BindingDraft>;
}): { bindings: ConfigureBinding[]; error: CompositionError | null } {
  const bindings: ConfigureBinding[] = [];
  for (const slot of input.component.slots ?? []) {
    const draft = input.drafts[slot.key] ?? emptyDraft(slot);
    const required = slot.required || input.requiredSlotKeys.has(slot.key);
    if (draft.kind === "none" || !draft.value.trim()) {
      if (required)
        return {
          bindings: [],
          error: { messageKey: "CREATION_EDITOR_WIREFRAME_SLOT_REQUIRED_ERROR", slotKey: slot.key },
        };
      continue;
    }
    if (draft.kind === "field") {
      bindings.push({ kind: "field", slotKey: slot.key, fieldKey: draft.value.trim() });
      continue;
    }
    try {
      bindings.push({
        kind: "literal",
        slotKey: slot.key,
        value: parseLiteralValue(draft.value, slot.valueKind),
      });
    } catch {
      return {
        bindings: [],
        error: { messageKey: "CREATION_EDITOR_WIREFRAME_LITERAL_INVALID", slotKey: slot.key },
      };
    }
  }
  return { bindings, error: null };
}

export function createBindingDrafts(
  section: WireframeSectionV1Output,
  component: ComponentCatalogComponentV1 | null,
): Record<string, BindingDraft> {
  if (!component) return {};
  return Object.fromEntries(
    (component.slots ?? []).map((slot) => {
      const binding = (section.bindings ?? []).find((candidate) => candidate.slotKey === slot.key);
      if (binding?.kind === "field" && slot.acceptedBindingKinds.includes("field"))
        return [slot.key, { kind: "field", value: binding.fieldKey } satisfies BindingDraft];
      if (binding?.kind === "literal" && slot.acceptedBindingKinds.includes("literal"))
        return [
          slot.key,
          { kind: "literal", value: formatLiteralValue(binding.value) } satisfies BindingDraft,
        ];
      return [slot.key, emptyDraft(slot)];
    }),
  );
}

export function emptyDraft(slot: ComponentCatalogSlotV1): BindingDraft {
  return { kind: slot.acceptedBindingKinds[0] ?? "none", value: "" };
}

function parseLiteralValue(
  value: string,
  valueKind: ComponentCatalogSlotV1["valueKind"],
): JsonValueInput {
  const normalized = value.trim();
  if (valueKind === "text" || valueKind === "rich-text") return normalized;
  if (valueKind === "number") {
    const number = Number(normalized);
    if (!Number.isFinite(number)) throw new Error("Invalid numeric literal");
    return number;
  }
  if (valueKind === "boolean") {
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    throw new Error("Invalid boolean literal");
  }
  if (valueKind === "list") {
    const parsed: unknown = JSON.parse(normalized);
    if (!Array.isArray(parsed) || !isJsonValue(parsed)) throw new Error("Invalid list literal");
    return parsed;
  }
  if (!normalized.startsWith("{")) return normalized;
  const parsed: unknown = JSON.parse(normalized);
  if (!isJsonObject(parsed)) throw new Error("Invalid object literal");
  return parsed;
}

function isJsonObject(value: unknown): value is Record<string, JsonValueInput> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && isJsonValue(value);
}

function isJsonValue(value: unknown): value is JsonValueInput {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function formatLiteralValue(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
}
