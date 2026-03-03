import type {
  ContentTypeFieldSchema,
  FieldDefinition,
  LocalizedString,
} from "@celestial/block-protocol";

export type BindingPathOption = { value: string; label: string };

export function parseContentTypeFieldSchema(input: unknown): ContentTypeFieldSchema | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const rec = input as Record<string, unknown>;
  if (rec.version !== 1) return null;
  const fieldsUnknown = rec.fields;
  if (!Array.isArray(fieldsUnknown)) return null;
  // Studio 仅需要字段 key/label/kind，用于生成可选绑定路径；不在这里做严格 runtime 校验。
  return rec as unknown as ContentTypeFieldSchema;
}

export function buildPrimaryEntryBindingPathOptions(args: {
  schema: ContentTypeFieldSchema;
  labelLocale: string;
  defaultLocale: string;
  maxDepth?: number;
}): BindingPathOption[] {
  const maxDepth = typeof args.maxDepth === "number" ? args.maxDepth : 4;
  const out: BindingPathOption[] = [];

  const resolveLabel = (label: LocalizedString | undefined, keyFallback: string): string => {
    if (!label) return keyFallback;
    return (
      label[args.labelLocale] ||
      label[args.defaultLocale] ||
      label["en-US"] ||
      Object.values(label)[0] ||
      keyFallback
    );
  };

  const add = (path: string, label: string) => {
    out.push({ value: path, label });
  };

  const walkField = (field: FieldDefinition, basePath: string, depth: number) => {
    const label = resolveLabel(field.label, field.key);
    add(basePath, `${label} (${basePath})`);

    if (field.kind === "reference") {
      add(`${basePath}._ref`, `${label}._ref (${basePath}._ref)`);
      return;
    }

    if (depth >= maxDepth) return;

    if (field.kind === "object") {
      const nested = field.validation?.fields ?? [];
      for (const child of nested) {
        walkField(child, `${basePath}.${child.key}`, depth + 1);
      }
      return;
    }

    if (field.kind === "array") {
      add(`${basePath}.0`, `${label}[0] (${basePath}.0)`);
      const of = field.validation?.of;
      if (!of) return;
      if (of.kind === "object") {
        for (const child of of.validation?.fields ?? []) {
          walkField(child, `${basePath}.0.${child.key}`, depth + 1);
        }
        return;
      }
      add(`${basePath}.0`, `${label}[0] (${basePath}.0)`);
    }
  };

  for (const field of args.schema.fields ?? []) {
    if (!field || typeof field !== "object") continue;
    if (!field.key) continue;
    walkField(field, `fields.${field.key}`, 1);
  }

  const seen = new Set<string>();
  return out.filter((opt) => {
    if (seen.has(opt.value)) return false;
    seen.add(opt.value);
    return true;
  });
}
