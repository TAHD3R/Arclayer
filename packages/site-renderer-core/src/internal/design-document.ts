import type {
  DesignBindingExprV1,
  DesignDocumentV1,
  DesignLayoutV1,
  DesignNodeResponsiveOverrideV1,
  DesignNodeV1,
  DesignStyleV1,
  DesignTransformV1,
} from "@celestial/site-block-protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Must match the selector guard used by the editor overlay.
const SAFE_NODE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

function isSafeNodeId(value: string): boolean {
  return SAFE_NODE_ID_RE.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isBindingExpr(value: unknown): value is DesignBindingExprV1 {
  if (!isRecord(value)) return false;
  if (value.kind !== "binding") return false;
  if (
    value.source !== "primaryEntry" &&
    value.source !== "prefabProps" &&
    value.source !== "routeParams" &&
    value.source !== "site" &&
    value.source !== "viewer"
  ) {
    return false;
  }
  return typeof value.path === "string" && value.path.trim().length > 0;
}

function isLayout(value: unknown): value is DesignLayoutV1 {
  if (!isRecord(value)) return false;
  if (!isRecord(value.children)) return false;
  const children = value.children as Record<string, unknown>;
  if (children.mode !== "absolute" && children.mode !== "auto") return false;
  if (children.mode === "auto") {
    if (children.direction !== "row" && children.direction !== "column") return false;
  }
  if (value.self !== undefined) {
    if (!isRecord(value.self)) return false;
    const self = value.self as Record<string, unknown>;
    if (!isRecord(self.rect)) return false;
    const rect = self.rect as Record<string, unknown>;
    if (typeof rect.x !== "number" || typeof rect.y !== "number") return false;
    if (typeof rect.width !== "number" || typeof rect.height !== "number") return false;
  }
  return true;
}

function isStyle(value: unknown): value is DesignStyleV1 {
  if (!isRecord(value)) return false;
  // Keep permissive for v1; renderer will sanitize.
  return true;
}

function isTransform(value: unknown): value is DesignTransformV1 {
  if (!isRecord(value)) return false;
  return true;
}

function isResponsiveOverride(value: unknown): value is DesignNodeResponsiveOverrideV1 {
  if (!isRecord(value)) return false;
  const allowed = new Set(["layout", "style", "transform", "motionRefs"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return false;
  }
  if (value.layout !== undefined && !isRecord(value.layout)) return false;
  if (value.style !== undefined && !isRecord(value.style)) return false;
  if (value.transform !== undefined && !isRecord(value.transform)) return false;
  if (value.motionRefs !== undefined && !Array.isArray(value.motionRefs)) return false;
  return true;
}

function isNode(value: unknown): value is DesignNodeV1 {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !isSafeNodeId(value.id)) return false;
  if (typeof value.type !== "string") return false;
  if (value.name !== undefined && typeof value.name !== "string") return false;
  if (value.locked !== undefined && typeof value.locked !== "boolean") return false;
  if (value.hidden !== undefined && typeof value.hidden !== "boolean") return false;

  if (value.layout !== undefined && !isLayout(value.layout)) return false;
  if (value.style !== undefined && !isStyle(value.style)) return false;
  if (value.transform !== undefined && !isTransform(value.transform)) return false;

  if (value.responsive !== undefined) {
    if (!isRecord(value.responsive)) return false;
    for (const [bp, ov] of Object.entries(value.responsive)) {
      if (!bp.trim()) return false;
      if (!isResponsiveOverride(ov)) return false;
    }
  }

  switch (value.type) {
    case "page_root":
    case "frame":
    case "group": {
      if (!isStringArray(value.children)) return false;
      return true;
    }
    case "rect": {
      return value.children === undefined;
    }
    case "text": {
      if (value.tag !== undefined) {
        if (value.tag !== "p" && value.tag !== "span" && value.tag !== "h1" && value.tag !== "h2" && value.tag !== "h3") {
          return false;
        }
      }
      if (value.align !== undefined) {
        if (value.align !== "left" && value.align !== "center" && value.align !== "right") return false;
      }
      // text is localized string map or binding
      if (!isRecord(value.text) && !isBindingExpr(value.text)) return false;
      return value.children === undefined;
    }
    case "image": {
      if (typeof value.src !== "string" && !isBindingExpr(value.src)) return false;
      if (value.alt !== undefined) {
        if (typeof value.alt !== "string" && !isRecord(value.alt) && !isBindingExpr(value.alt)) return false;
      }
      if (value.objectFit !== undefined) {
        if (value.objectFit !== "cover" && value.objectFit !== "contain" && value.objectFit !== "fill" && value.objectFit !== "none") {
          return false;
        }
      }
      return value.children === undefined;
    }
    case "embed": {
      if (typeof value.url !== "string" && !isBindingExpr(value.url)) return false;
      return value.children === undefined;
    }
    case "prefab_instance": {
      if (typeof value.prefabId !== "string" || !value.prefabId.trim()) return false;
      if (!isRecord(value.props)) return false;
      if (value.slotChildren !== undefined) {
        if (!isRecord(value.slotChildren)) return false;
        for (const [name, ids] of Object.entries(value.slotChildren)) {
          if (!name.trim()) return false;
          if (!isStringArray(ids)) return false;
        }
      }
      return value.children === undefined;
    }
  }

  return false;
}

export function isDesignDocumentV1(value: unknown): value is DesignDocumentV1 {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.rootId !== "string" || !isSafeNodeId(value.rootId)) return false;
  if (!isRecord(value.nodesById)) return false;

  const nodesById = value.nodesById as Record<string, unknown>;
  const root = nodesById[value.rootId];
  if (!isNode(root)) return false;
  if (isRecord(root) && root.type !== "page_root") return false;

  for (const [id, node] of Object.entries(nodesById)) {
    if (!isSafeNodeId(id)) return false;
    if (!node) return false;
    if (!isNode(node)) return false;
    if (isRecord(node) && node.id !== id) return false;
  }

  // Ensure all child references exist (no cycle detection here).
  for (const node of Object.values(nodesById)) {
    if (!isRecord(node)) return false;
    const children = node.children;
    if (children === undefined) continue;
    if (!isStringArray(children)) return false;
    for (const childId of children) {
      if (!nodesById[childId]) return false;
    }
  }

  // slotChildren references must exist too.
  for (const node of Object.values(nodesById)) {
    if (!isRecord(node)) return false;
    if (node.type !== "prefab_instance") continue;
    const slotChildren = node.slotChildren;
    if (slotChildren === undefined) continue;
    if (!isRecord(slotChildren)) return false;
    for (const ids of Object.values(slotChildren)) {
      if (!isStringArray(ids)) return false;
      for (const childId of ids) {
        if (!nodesById[childId]) return false;
      }
    }
  }

  return true;
}
