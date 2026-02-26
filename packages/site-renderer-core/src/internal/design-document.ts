import type {
  BlockNode,
  DesignBlockNodeV1,
  DesignDocumentV1,
  DesignNodeId,
  DesignNodeV1,
  DesignPageNodeV1,
  DocumentIR,
} from "@celestial/site-block-protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

// Must match the guard used by the editor overlay selectors.
const SAFE_NODE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

function isSafeNodeId(value: string): boolean {
  return SAFE_NODE_ID_RE.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDesignPageNodeV1(value: unknown): value is DesignPageNodeV1 {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !isSafeNodeId(value.id)) return false;
  if (value.type !== "page") return false;
  if (!Array.isArray(value.children) || !value.children.every((x) => typeof x === "string")) return false;
  // meta is validated by DocumentIR guard; keep it permissive here.
  return true;
}

function isDesignBlockNodeV1(value: unknown): value is DesignBlockNodeV1 {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !isSafeNodeId(value.id)) return false;
  if (typeof value.type !== "string" || !value.type.trim()) return false;
  if (!isRecord(value.props)) return false;
  if (value.children !== undefined && !isStringArray(value.children)) return false;
  // responsive is optional; keep permissive (validated when compiled into DocumentIR).
  return true;
}

export function isDesignDocumentV1(value: unknown): value is DesignDocumentV1 {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.rootId !== "string" || !isSafeNodeId(value.rootId)) return false;
  if (!isRecord(value.nodesById)) return false;

  const nodesById = value.nodesById as Record<string, unknown>;
  const root = nodesById[value.rootId];
  if (!isDesignPageNodeV1(root)) return false;

  for (const [id, node] of Object.entries(nodesById)) {
    if (!isSafeNodeId(id)) return false;
    if (!node) return false;
    // Ensure node.id matches the key to keep patches predictable.
    if (isRecord(node) && node.id !== id) return false;

    if (id === value.rootId) continue;
    if (!isDesignBlockNodeV1(node)) return false;
  }

  // Ensure all child references exist (tree-like validation, no cycles check here).
  for (const node of Object.values(nodesById)) {
    if (!isRecord(node)) return false;
    const children = node.children;
    if (children === undefined) continue;
    if (!isStringArray(children)) return false;
    for (const childId of children) {
      if (!nodesById[childId]) return false;
    }
  }

  return true;
}

export function migrateDocumentIRToDesignDocumentV1(doc: DocumentIR): DesignDocumentV1 {
  const nodesById: Record<DesignNodeId, DesignNodeV1> = {};

  const visit = (node: BlockNode): DesignNodeId => {
    const id = node.id;
    if (!id || !isSafeNodeId(id)) throw new Error("Invalid block id in DocumentIR");
    const type = node.type;
    if (!type.trim()) throw new Error(`Invalid block type for ${id}`);

    const childIds = Array.isArray(node.children) ? node.children.map(visit) : undefined;

    nodesById[id] = {
      id,
      type,
      props: node.props as Record<string, unknown>,
      ...(childIds ? { children: childIds } : {}),
      ...(node.responsive ? { responsive: node.responsive } : {}),
    };

    return id;
  };

  const rootId = "page";
  const rootChildren = Array.isArray(doc.blocks) ? doc.blocks.map(visit) : [];

  nodesById[rootId] = {
    id: rootId,
    type: "page",
    ...(doc.meta ? { meta: doc.meta } : {}),
    children: rootChildren,
  };

  return {
    version: 1,
    rootId,
    nodesById,
  };
}

export function compileDesignDocumentV1ToDocumentIR(designDoc: DesignDocumentV1): DocumentIR {
  const root = designDoc.nodesById[designDoc.rootId];
  if (!isDesignPageNodeV1(root)) {
    throw new Error("DesignDocument root node missing or invalid");
  }

  const visiting = new Set<DesignNodeId>();

  const compileNode = (id: DesignNodeId): BlockNode => {
    const node = designDoc.nodesById[id] as DesignNodeV1 | undefined;
    if (!node) {
      throw new Error(`Missing node: ${id}`);
    }
    if (!isDesignBlockNodeV1(node)) throw new Error(`Invalid block node: ${id}`);

    if (visiting.has(id)) {
      throw new Error(`Cycle detected at node: ${id}`);
    }
    visiting.add(id);

    const base: BlockNode = {
      id: node.id,
      type: node.type,
      props: node.props,
    };

    if (node.responsive !== undefined) {
      base.responsive = node.responsive;
    }

    if (Array.isArray(node.children) && node.children.length) {
      base.children = node.children.map((childId) => compileNode(childId));
    }

    visiting.delete(id);
    return base;
  };

  const blocks = root.children.map((id) => compileNode(id));

  return {
    version: 1,
    ...(root.meta ? { meta: root.meta } : {}),
    blocks,
  };
}
