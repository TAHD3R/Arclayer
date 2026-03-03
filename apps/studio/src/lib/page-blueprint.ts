import type { PageBlueprint } from "@celestial/block-protocol";

export function clonePageBlueprint(value: PageBlueprint): PageBlueprint {
  const sc = (globalThis as unknown as { structuredClone?: (v: unknown) => unknown })
    .structuredClone;
  if (typeof sc === "function") return sc(value) as PageBlueprint;
  return JSON.parse(JSON.stringify(value)) as PageBlueprint;
}

export function readPageRootDataSources(doc: PageBlueprint): {
  primaryEntryId?: string;
  primaryEntryTypeHint?: string;
} {
  const root = doc.nodesById[doc.rootId];
  if (!root || root.type !== "page_root") return {};
  const ds = root.dataSources ?? undefined;
  if (!ds) return {};

  const out: { primaryEntryId?: string; primaryEntryTypeHint?: string } = {};
  if (typeof ds.primaryEntryId === "string" && ds.primaryEntryId.trim()) {
    out.primaryEntryId = ds.primaryEntryId.trim();
  }
  if (typeof ds.primaryEntryTypeHint === "string" && ds.primaryEntryTypeHint.trim()) {
    out.primaryEntryTypeHint = ds.primaryEntryTypeHint.trim();
  }
  return out;
}

export function updatePageRootDataSources(
  doc: PageBlueprint,
  patch: {
    primaryEntryTypeHint?: string | null | undefined;
    primaryEntryId?: string | null | undefined;
  },
): PageBlueprint {
  const next = clonePageBlueprint(doc);
  const root = next.nodesById[next.rootId];
  if (!root || root.type !== "page_root") return next;

  const ds = { ...(root.dataSources as Record<string, unknown> | undefined) } as Record<
    string,
    unknown
  >;

  if ("primaryEntryTypeHint" in patch) {
    const v = (patch.primaryEntryTypeHint ?? "").trim();
    if (v) {
      ds.primaryEntryTypeHint = v;
    } else {
      delete ds.primaryEntryTypeHint;
      // When type hint is cleared, also clear primaryEntryId to avoid stale mismatch.
      delete ds.primaryEntryId;
    }
  }

  if ("primaryEntryId" in patch) {
    const v = (patch.primaryEntryId ?? "").trim();
    if (v) ds.primaryEntryId = v;
    else delete ds.primaryEntryId;
  }

  root.dataSources = Object.keys(ds).length ? (ds as any) : undefined;
  return next;
}

export function normalizePageBlueprintForSave(doc: PageBlueprint): PageBlueprint {
  // Goal: avoid payloads like { kind: "literal" } (missing `value`) which fail backend validation.
  // Also normalize `undefined` to `null` (JSON drops undefined fields).
  const next = clonePageBlueprint(doc);

  const normalizeDesignValue = (input: unknown): unknown => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    const obj = input as Record<string, unknown>;
    const kind = obj.kind;
    if (kind === "literal") {
      if (!("value" in obj) || obj.value === undefined) {
        return { kind: "literal", value: null } as const;
      }
      return obj;
    }
    return obj;
  };

  for (const node of Object.values(next.nodesById)) {
    if (!node || typeof node !== "object") continue;
    if (node.type === "prefab_instance") {
      const props = (node as any).props as Record<string, unknown> | undefined;
      if (!props) continue;
      for (const [k, v] of Object.entries(props)) {
        props[k] = normalizeDesignValue(v);
      }
      continue;
    }
    if (node.type === "content_ref") {
      const props = (node as any).props as Record<string, unknown> | undefined;
      if (!props) continue;
      for (const [k, v] of Object.entries(props)) {
        props[k] = normalizeDesignValue(v);
      }
    }
  }

  return next;
}
