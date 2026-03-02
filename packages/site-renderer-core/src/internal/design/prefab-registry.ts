import type {
  BlockManifest,
  FieldDefinition,
  LocalizedString,
  ViewerContext,
} from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";
import type {
  DesignBindingExprV1,
  PageBlueprint,
  DesignNodeId,
  DesignNodeV1,
  DesignPrefabInstanceNodeV1,
  DesignStyleV1,
  DesignValueV1,
  PrefabSlotChildrenV1,
} from "@celestial/site-block-protocol";

export type DesignRenderDataSourcesV1 = {
  primaryEntry?: {
    id?: string;
    data?: Record<string, unknown>;
  };
  /**
   * 当前 PrefabInstance 的 props（已解析为可渲染的基础值）。
   * 用于 prefab 模板中的 binding（例如 text 绑定到 prefabProps.title）。
   *
   * 注意：这是渲染期数据源，不等同于持久化协议字段。
   */
  prefabProps?: Record<string, unknown>;
  routeParams?: Record<string, string>;
  site?: Record<string, unknown>;
  viewer?: {
    locale?: string;
    fallbackLocale?: string;
    breakpoint?: string;
    mode?: string;
  };
};

export type PrefabTemplateV1 = {
  rootId: DesignNodeId;
  nodesById: Record<DesignNodeId, DesignNodeV1>;
  /**
   * Map slotName -> target node id inside the template.
   * The target node is expected to be a container-like node (frame/group) that can accept children.
   */
  slotTargets: Record<string, DesignNodeId>;
};

export type PrefabDefinitionV1 = {
  prefabId: string;
  manifest: BlockManifest;
  template: PrefabTemplateV1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBindingExpr(value: unknown): value is DesignBindingExprV1 {
  if (!isRecord(value)) return false;
  return (
    value.kind === "binding" && typeof value.source === "string" && typeof value.path === "string"
  );
}

function isDesignValue(value: unknown): value is DesignValueV1 {
  if (!isRecord(value)) return false;
  if (value.kind === "literal") return true;
  return isBindingExpr(value);
}

function validateFieldValue(field: FieldDefinition, value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null) return !field.required;

  switch (field.kind) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "select":
      if (typeof value !== "string") return false;
      if (!field.validation?.options) return true;
      return field.validation.options.some((opt) => opt.value === value);
    case "text":
      return typeof value === "string" || isRecord(value);
    case "color":
    case "url":
      return typeof value === "string";
    default:
      return true;
  }
}

export type PrefabValidationResultV1 = {
  ok: boolean;
  errors: string[];
  normalizedProps: Record<string, DesignValueV1>;
};

export function validatePrefabInstancePropsV1(args: {
  manifest: BlockManifest;
  props: Record<string, unknown>;
}): PrefabValidationResultV1 {
  const errors: string[] = [];
  const normalizedProps: Record<string, DesignValueV1> = {};

  const fields = args.manifest.attributes ?? [];
  const incoming = args.props;

  for (const field of fields) {
    const raw = incoming[field.key];

    if (raw === undefined || raw === null) {
      if (raw === null && field.required) {
        errors.push(`Required prefab prop "${field.key}" cannot be null`);
      }
      if (raw === undefined && field.required && field.default === undefined) {
        errors.push(`Missing required prefab prop "${field.key}"`);
      }
      if (raw === undefined && field.default !== undefined) {
        normalizedProps[field.key] = { kind: "literal", value: field.default };
      }
      continue;
    }

    if (!isDesignValue(raw)) {
      errors.push(`Invalid prefab prop value for "${field.key}": expected DesignValueV1`);
      continue;
    }

    if (raw.kind === "literal") {
      if (!validateFieldValue(field, raw.value)) {
        errors.push(`Invalid literal value for prefab prop "${field.key}"`);
        continue;
      }
    } else {
      if (!raw.source || !raw.path) {
        errors.push(`Invalid binding for prefab prop "${field.key}"`);
        continue;
      }
    }

    normalizedProps[field.key] = raw;
  }

  // Keep unknown keys out to make schema strict-by-default.
  return { ok: errors.length === 0, errors, normalizedProps };
}

export function resolveBindingToUnknown(args: {
  expr: DesignBindingExprV1;
  data: DesignRenderDataSourcesV1 | undefined;
}): unknown {
  const { expr, data } = args;
  const root =
    expr.source === "primaryEntry"
      ? data?.primaryEntry?.data
      : expr.source === "prefabProps"
        ? data?.prefabProps
        : expr.source === "routeParams"
          ? data?.routeParams
          : expr.source === "site"
            ? data?.site
            : data?.viewer;

  if (!root) return undefined;

  const path = expr.path.trim();
  if (!path) return undefined;

  const segs = path
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);
  let cur: unknown = root;
  for (const seg of segs) {
    if (!isRecord(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

export function resolveDesignValueToString(args: {
  value: DesignValueV1 | LocalizedString | string | undefined;
  ctx: ViewerContext;
  data: DesignRenderDataSourcesV1 | undefined;
}): string {
  const v = args.value;
  if (v === undefined) return "";
  if (typeof v === "string") return v;

  if (isBindingExpr(v)) {
    const out = resolveBindingToUnknown({ expr: v, data: args.data });
    return typeof out === "string" ? out : out == null ? "" : String(out);
  }

  if (isRecord(v) && (v as { kind?: unknown }).kind === "literal") {
    const raw = (v as Extract<DesignValueV1, { kind: "literal" }>).value;
    if (typeof raw === "string") return raw;
    if (isRecord(raw)) {
      return resolveLocalizedValue(raw as LocalizedString, args.ctx) ?? "";
    }
    return raw == null ? "" : String(raw);
  }

  // LocalizedString map
  if (isRecord(v)) {
    return resolveLocalizedValue(v as LocalizedString, args.ctx) ?? "";
  }

  return "";
}

function cloneStyle(style: DesignStyleV1 | undefined): DesignStyleV1 | undefined {
  if (!style) return undefined;
  return JSON.parse(JSON.stringify(style)) as DesignStyleV1;
}

export function filterStyleByWhitelist(args: {
  style: DesignStyleV1 | undefined;
  whitelist: string[] | undefined;
}): DesignStyleV1 | undefined {
  const { style, whitelist } = args;
  if (!style) return undefined;
  if (!Array.isArray(whitelist) || whitelist.length === 0) return cloneStyle(style);

  const allow = new Set(whitelist);
  const out: DesignStyleV1 = {};
  for (const [key, val] of Object.entries(style as Record<string, unknown>)) {
    if (allow.has(key)) (out as Record<string, unknown>)[key] = val;
  }
  // Preserve nested typography only when explicitly allowed.
  if (allow.has("typography")) {
    const typography = style.typography ? cloneStyle(style)?.typography : undefined;
    if (typography) out.typography = typography;
  }
  return out;
}

function collectSubtreeIds(nodesById: Record<string, DesignNodeV1>, rootId: string): string[] {
  const out: string[] = [];
  const stack: string[] = [rootId];
  const seen = new Set<string>();

  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);

    const node = nodesById[id];
    if (!node) continue;
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const childId of children) {
        if (typeof childId === "string") stack.push(childId);
      }
    }

    // Prefab instances can reference additional children through slotChildren.
    if (node.type === "prefab_instance") {
      const slotChildren = (node as DesignPrefabInstanceNodeV1).slotChildren;
      if (slotChildren && typeof slotChildren === "object") {
        for (const ids of Object.values(slotChildren)) {
          if (!Array.isArray(ids)) continue;
          for (const childId of ids) {
            if (typeof childId === "string") stack.push(childId);
          }
        }
      }
    }
  }

  return out;
}

export type PrefabExpansionResultV1 = {
  document: PageBlueprint;
  warnings: string[];
};

/**
 * Expand a prefab instance into a local design document:
 * - Template nodes get deterministic prefixed ids to avoid collisions.
 * - Slot children are pulled from the global document and inserted into the template slot targets.
 */
export function expandPrefabInstanceV1(args: {
  instance: DesignPrefabInstanceNodeV1;
  def: PrefabDefinitionV1;
  globalNodesById: Record<DesignNodeId, DesignNodeV1>;
}): PrefabExpansionResultV1 {
  const warnings: string[] = [];
  const instanceId = args.instance.id;

  // Expanded template node ids must remain PageBlueprint-safe. In particular:
  // - must start with [A-Za-z0-9]
  // - may only contain [A-Za-z0-9:_-]
  const toSafeSegment = (value: string) => value.replaceAll(/[^A-Za-z0-9:_-]/g, "_");
  const prefix = `p_${toSafeSegment(args.def.prefabId)}_${toSafeSegment(instanceId)}_`;
  const mapId = (id: string) => `${prefix}${id}`;

  const tplNodes: Record<string, DesignNodeV1> = {};
  for (const [id, node] of Object.entries(args.def.template.nodesById)) {
    tplNodes[mapId(id)] = {
      ...(node as unknown as Record<string, unknown>),
      id: mapId(id),
    } as DesignNodeV1;
  }

  // Patch template child references to prefixed ids.
  for (const node of Object.values(tplNodes)) {
    const maybeChildren = (node as { children?: unknown }).children;
    if (!Array.isArray(maybeChildren)) continue;
    (node as unknown as { children: string[] }).children = maybeChildren.map((c) =>
      typeof c === "string" ? mapId(c) : c,
    );
  }

  // Prepare local nodesById with template nodes first.
  const nodesById: Record<string, DesignNodeV1> = { ...tplNodes };

  // Pull slot subtrees from global doc.
  const slotChildren: PrefabSlotChildrenV1 = args.instance.slotChildren ?? {};
  for (const [slotName, childIds] of Object.entries(slotChildren)) {
    const targetTplId = args.def.template.slotTargets[slotName];
    if (!targetTplId) {
      warnings.push(`Unknown slot "${slotName}" for prefab "${args.def.prefabId}"`);
      continue;
    }

    const targetId = mapId(targetTplId);
    const target = nodesById[targetId];
    if (!target) {
      warnings.push(
        `Missing slot target "${targetTplId}" in prefab template "${args.def.prefabId}"`,
      );
      continue;
    }

    // Collect all ids referenced by this slot subtree and copy nodes into local nodesById.
    for (const childId of childIds) {
      const subtree = collectSubtreeIds(args.globalNodesById, childId);
      for (const id of subtree) {
        const node = args.globalNodesById[id];
        if (!node) continue;
        nodesById[id] = node;
      }
    }

    // Inject direct slot children ids into the target container.
    if (target.type !== "frame" && target.type !== "group") {
      warnings.push(`Slot target "${targetTplId}" must be a container node`);
      continue;
    }
    (target as unknown as { children: string[] }).children = [...childIds];
  }

  const rootId = mapId(args.def.template.rootId);
  if (!nodesById[rootId]) {
    warnings.push(`Missing prefab template root "${args.def.template.rootId}"`);
  }

  return {
    document: {
      version: 1,
      rootId,
      nodesById,
    },
    warnings,
  };
}

export class PrefabRegistryV1 {
  private defs = new Map<string, PrefabDefinitionV1>();

  register(def: PrefabDefinitionV1): void {
    const id = def.prefabId.trim();
    if (!id) return;
    this.defs.set(id, def);
  }

  get(prefabId: string): PrefabDefinitionV1 | null {
    const id = (prefabId || "").trim();
    if (!id) return null;
    return this.defs.get(id) ?? null;
  }

  list(): PrefabDefinitionV1[] {
    return [...this.defs.values()];
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toSlotManifestMap(
  manifest: BlockManifest,
): Map<string, NonNullable<BlockManifest["slots"]>[number]> {
  const out = new Map<string, NonNullable<BlockManifest["slots"]>[number]>();
  const slots = manifest.slots ?? [];
  for (const slot of slots) {
    if (!slot || typeof slot !== "object") continue;
    if (!isNonEmptyString(slot.name)) continue;
    out.set(slot.name, slot);
  }
  return out;
}

export function validateSlotChildrenAgainstManifest(args: {
  manifest: BlockManifest;
  slotChildren: PrefabSlotChildrenV1 | undefined;
  globalNodesById: Record<DesignNodeId, DesignNodeV1>;
}): { ok: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  const slots = toSlotManifestMap(args.manifest);
  const children = args.slotChildren ?? {};

  for (const [slotName, ids] of Object.entries(children)) {
    const slot = slots.get(slotName);
    if (!slot) {
      warnings.push(`Unknown slot "${slotName}"`);
      continue;
    }

    if (!Array.isArray(ids)) {
      errors.push(`slotChildren["${slotName}"] must be an array`);
      continue;
    }

    const min =
      typeof slot.minChildren === "number" && Number.isFinite(slot.minChildren)
        ? slot.minChildren
        : 0;
    const max =
      typeof slot.maxChildren === "number" && Number.isFinite(slot.maxChildren)
        ? slot.maxChildren
        : undefined;

    if (ids.length < min) errors.push(`Slot "${slotName}" requires at least ${min} children`);
    if (max !== undefined && ids.length > max)
      errors.push(`Slot "${slotName}" allows at most ${max} children`);

    const allowed =
      Array.isArray(slot.allowedNodeTypes) && slot.allowedNodeTypes.length
        ? new Set(slot.allowedNodeTypes)
        : null;
    for (const id of ids) {
      const node = args.globalNodesById[id];
      if (!node) {
        errors.push(`Slot "${slotName}" references missing node "${id}"`);
        continue;
      }
      if (allowed && !allowed.has(node.type)) {
        errors.push(`Slot "${slotName}" does not allow node type "${node.type}"`);
      }
    }
  }

  // Ensure required slots exist even if empty maps omit keys.
  for (const slot of slots.values()) {
    const required = Boolean(slot.required);
    if (!required) continue;
    const ids = children[slot.name];
    const hasAny = Array.isArray(ids) && ids.length > 0;
    if (!hasAny) errors.push(`Required slot "${slot.name}" cannot be empty`);
  }

  return { ok: errors.length === 0, warnings, errors };
}

export function resolvePrefabPropsToPlainValues(args: {
  props: Record<string, DesignValueV1>;
  ctx: ViewerContext;
  data: DesignRenderDataSourcesV1 | undefined;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args.props)) {
    if (value.kind === "literal") {
      out[key] = value.value;
      continue;
    }
    const resolved = resolveBindingToUnknown({ expr: value, data: args.data });
    out[key] = resolved;
  }
  return out;
}
