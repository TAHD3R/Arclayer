import { applyManualProjectSlugInput, buildProjectSlug } from "@/lib/project-slug";
import type { CreateAdminContentModelPayload } from "@/types/api";

import type { ContentTypeIdentifierState, CreateContentTypeFormValues } from "./types";

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const IRREGULAR_PLURALS = new Map<string, string>([
  ["category", "categories"],
  ["person", "people"],
]);

export function createGeneratedIdentifier(value: string): ContentTypeIdentifierState {
  return {
    value,
    source: "generated",
  };
}

export function createManualIdentifier(value: string): ContentTypeIdentifierState {
  return {
    value: applyManualProjectSlugInput(value).value,
    source: "manual",
  };
}

export function toContentTypeIdentifierSeed(name: string): string {
  return buildProjectSlug(name);
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
}): CreateAdminContentModelPayload {
  return {
    name: values.name,
    singularKey: values.singularKey,
    pluralKey: values.pluralKey,
    description: values.description,
    modelKind: "collection_type",
    fields: [],
    relations: [],
    capabilities: ["queryable"],
    routing: { mode: "none" },
    workflow: { states: ["draft"], initialState: "draft" },
    views: [],
  };
}
