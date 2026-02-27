import type {
  BlockId,
  EditorHistoryState,
  EditorInsertBlockArgs,
  EditorInsertBlockPosition,
  EditorInsertBlockResult,
  EditorInsertBlockTreeArgs,
  EditorLayerNode,
  EditorSelectionInspector,
  EditorSelectionPatch,
  EditorSelectionPatchSection,
} from "@celestial/site-editor-protocol";
import { EDITOR_PAGE_ROOT_BLOCK_ID } from "@celestial/site-editor-protocol";

import type {
  BreakpointName,
  DesignDocumentV1,
  DesignLayoutV1,
  DesignNodeId,
  DesignNodeResponsiveOverrideV1,
  DesignNodeV1,
  DesignPrefabInstanceNodeV1,
  DesignStyleV1,
  DesignValueV1,
} from "@celestial/site-block-protocol";
import {
  CORE_BLOCK_MANIFESTS,
  PREFAB_BLOCK_MANIFESTS,
  type BlockNode,
  type BlockManifest,
  type FieldDefinition,
} from "@celestial/site-block-protocol";

import { resolveDesignNodeAtBreakpointV1 } from "@celestial/site-renderer-core";

const HISTORY_LIMIT_DEFAULT = 100;

const MANIFEST_BY_TYPE = new Map<string, BlockManifest>(
  [...CORE_BLOCK_MANIFESTS, ...PREFAB_BLOCK_MANIFESTS].map((m) => [m.type, m]),
);

type DesignContainerNodeV1 = Extract<DesignNodeV1, { children: DesignNodeId[] }>;

type EditorDocumentHistory = {
  past: DesignDocumentV1[];
  present: DesignDocumentV1;
  future: DesignDocumentV1[];
  limit: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMotionRefsV1(value: unknown): value is NonNullable<DesignNodeV1["motionRefs"]> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      isRecord(item) && typeof item.motionId === "string" && item.motionId.trim().length > 0,
  );
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value) as T;
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneDocument(doc: DesignDocumentV1): DesignDocumentV1 {
  return cloneJson(doc);
}

function findManifestByType(type: string): BlockManifest | null {
  const normalized = (type || "").trim();
  if (!normalized) return null;
  return MANIFEST_BY_TYPE.get(normalized) ?? null;
}

function isContainerNode(node: DesignNodeV1): node is DesignContainerNodeV1 {
  return node.type === "page_root" || node.type === "frame" || node.type === "group";
}

function isPrefabInspectorType(type: string): boolean {
  return type.startsWith("prefab:");
}

function prefabIdFromInspectorType(type: string): string | null {
  if (!isPrefabInspectorType(type)) return null;
  const id = type.slice("prefab:".length).trim();
  return id ? id : null;
}

function buildEmptyDocument(): DesignDocumentV1 {
  // Root id must be stable across Host/Admin and Portal/iframe to keep
  // layer tree + drag rules consistent.
  const rootId: DesignNodeId = EDITOR_PAGE_ROOT_BLOCK_ID;
  const root: DesignNodeV1 = {
    id: rootId,
    type: "page_root",
    name: "Page",
    children: [],
    layout: { children: { mode: "absolute" } },
  };
  return { version: 1, rootId, nodesById: { [rootId]: root } };
}

let idSeq = 0;
function createNodeId(): DesignNodeId {
  idSeq += 1;
  // Must match SAFE_NODE_ID_RE in renderer guard: starts with alnum, then alnum/:/_/-
  return `n${Date.now().toString(36)}_${idSeq.toString(36)}`;
}

function defaultRectLayout(x: number, y: number, width: number, height: number): DesignLayoutV1 {
  return {
    self: {
      rect: { x, y, width, height },
      constraints: { horizontal: "left", vertical: "top" },
      alignX: "start",
      alignY: "start",
    },
    children: { mode: "absolute" },
  };
}

function defaultStyle(): DesignStyleV1 {
  return {};
}

function toLocalizedText(value: unknown): { "en-US": string; "zh-CN": string } {
  if (typeof value === "string") return { "en-US": value, "zh-CN": value };
  if (isRecord(value)) {
    const en = typeof value["en-US"] === "string" ? (value["en-US"] as string) : "";
    const zh = typeof value["zh-CN"] === "string" ? (value["zh-CN"] as string) : en;
    const out = en || zh ? { "en-US": en || zh, "zh-CN": zh || en } : null;
    if (out) return out;
  }
  const s = value == null ? "" : String(value);
  return { "en-US": s, "zh-CN": s };
}

export function convertLegacyBlocksToDesignFragment(blocks: BlockNode[]): {
  rootIds: DesignNodeId[];
  nodesById: Record<DesignNodeId, DesignNodeV1>;
} {
  const nodesById: Record<DesignNodeId, DesignNodeV1> = {};
  const rootIds: DesignNodeId[] = [];

  const visit = (block: BlockNode): DesignNodeId => {
    const id = createNodeId();
    const type = (block.type || "").trim();
    const props = isRecord(block.props) ? block.props : {};
    const children = Array.isArray(block.children) ? block.children : [];

    if (type === "__prefab__") {
      const prefabId = typeof props.prefab === "string" ? props.prefab : "unknown";
      const rawProps = isRecord(props.props) ? (props.props as Record<string, unknown>) : {};
      const mappedProps: Record<string, DesignValueV1> = {};
      for (const [k, v] of Object.entries(rawProps)) {
        mappedProps[k] = { kind: "literal", value: v };
      }
      const slotChildren: Record<string, DesignNodeId[]> = {};
      if (children.length) {
        slotChildren.default = children.map((c) => visit(c));
      }
      const node: DesignPrefabInstanceNodeV1 = {
        id,
        type: "prefab_instance",
        prefabId,
        props: mappedProps,
        slotChildren,
        layout: defaultRectLayout(0, 0, 360, 240),
        style: defaultStyle(),
      };
      nodesById[id] = node;
      return id;
    }

    if (type === "container" || type === "grid" || type === "frame" || type === "group") {
      const node: DesignNodeV1 = {
        id,
        type: "frame",
        name: typeof props.name === "string" ? props.name : "Frame",
        children: children.map((c) => visit(c)),
        layout: defaultRectLayout(0, 0, 320, 200),
        style: defaultStyle(),
      };
      nodesById[id] = node;
      return id;
    }

    if (type === "image") {
      const src = typeof props.src === "string" ? props.src : "";
      const alt = props.alt ?? "";
      nodesById[id] = {
        id,
        type: "image",
        src,
        alt: toLocalizedText(alt),
        objectFit: "cover",
        layout: defaultRectLayout(0, 0, 240, 180),
        style: defaultStyle(),
      };
      return id;
    }

    if (type === "embed") {
      const url = typeof props.url === "string" ? props.url : "";
      nodesById[id] = {
        id,
        type: "embed",
        url,
        layout: defaultRectLayout(0, 0, 320, 180),
        style: defaultStyle(),
      };
      return id;
    }

    if (type === "heading" || type === "paragraph" || type === "quote" || type === "list") {
      const text = toLocalizedText((props as Record<string, unknown>).text);
      nodesById[id] = {
        id,
        type: "text",
        text,
        tag: type === "heading" ? "h2" : "p",
        layout: defaultRectLayout(0, 0, 240, 40),
        style: { typography: { fontSize: 16, lineHeight: 20 } },
      };
      return id;
    }

    // Fallback: map to a rect so we don't drop nodes silently.
    nodesById[id] = {
      id,
      type: "rect",
      name: type || "rect",
      layout: defaultRectLayout(0, 0, 120, 120),
      style: { backgroundColor: "#eee" },
    };
    return id;
  };

  for (const block of blocks) {
    rootIds.push(visit(block));
  }

  return { rootIds, nodesById };
}

function buildNodeLabel(node: DesignNodeV1): string {
  if (node.name && node.name.trim()) return node.name.trim();
  if (node.type === "prefab_instance") return `Prefab(${node.prefabId})`;
  return node.type;
}

function buildLayerSubtree(
  document: DesignDocumentV1,
  nodeId: DesignNodeId,
): EditorLayerNode | null {
  const node = document.nodesById[nodeId];
  if (!node) return null;
  const children = isContainerNode(node) ? node.children : [];
  return {
    id: node.id,
    type: node.type,
    label: buildNodeLabel(node),
    children: children
      .map((id) => buildLayerSubtree(document, id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  };
}

export function buildLayerTree(document: DesignDocumentV1): EditorLayerNode[] {
  const root = document.nodesById[document.rootId];
  if (!root || root.type !== "page_root") return [];
  const tree = buildLayerSubtree(document, root.id);
  return tree ? [tree] : [];
}

function resolveInspectorType(node: DesignNodeV1): string {
  if (node.type === "prefab_instance") return `prefab:${node.prefabId}`;
  if (node.type === "page_root") return "page";
  return node.type;
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

function toLiteralValue(value: unknown): DesignValueV1 {
  return { kind: "literal", value };
}

function buildComponentInspector(node: DesignNodeV1): Record<string, unknown> {
  if (node.type === "page_root") {
    return {
      title: node.seo?.title,
      description: node.seo?.description,
      dataSources: node.dataSources,
    };
  }
  if (node.type === "text") {
    return { text: node.text, tag: node.tag, align: node.align };
  }
  if (node.type === "image") {
    return { src: node.src, alt: node.alt, objectFit: node.objectFit };
  }
  if (node.type === "embed") {
    return { url: node.url };
  }
  if (node.type === "prefab_instance") {
    const propsOut: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.props)) {
      propsOut[k] = v;
    }
    return {
      prefabId: node.prefabId,
      props: propsOut,
      slotChildren: node.slotChildren ?? {},
    };
  }
  return {};
}

function buildLayoutInspector(node: DesignNodeV1): Record<string, unknown> {
  return node.layout ? cloneJson(node.layout) : {};
}

function buildDesignInspector(node: DesignNodeV1): Record<string, unknown> {
  return node.style ? cloneJson(node.style) : {};
}

function buildAnimationInspector(node: DesignNodeV1): Record<string, unknown> {
  return node.motionRefs ? { motionRefs: cloneJson(node.motionRefs) } : {};
}

export function buildSelectionInspector(
  document: DesignDocumentV1,
  selectedId: BlockId | null,
): EditorSelectionInspector {
  if (!selectedId) {
    return {
      blockId: null,
      blockType: null,
      component: {},
      layout: {},
      design: {},
      animation: {},
    };
  }

  const node = document.nodesById[selectedId];
  if (!node) {
    return {
      blockId: null,
      blockType: null,
      component: {},
      layout: {},
      design: {},
      animation: {},
    };
  }

  return {
    blockId: node.id,
    blockType: resolveInspectorType(node),
    component: buildComponentInspector(node),
    layout: buildLayoutInspector(node),
    design: buildDesignInspector(node),
    animation: buildAnimationInspector(node),
  };
}

function mergePatchValue(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (patch === null) return undefined;

  // Patch arrays are treated as replacement.
  if (Array.isArray(patch)) return patch;

  // Primitives are treated as replacement.
  if (!isRecord(patch)) return patch;

  const baseObj = isRecord(base) ? base : {};
  const out: Record<string, unknown> = { ...(baseObj as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) {
      delete out[k];
      continue;
    }
    const merged = mergePatchValue((baseObj as Record<string, unknown>)[k], v);
    if (merged === undefined) delete out[k];
    else out[k] = merged;
  }
  return out;
}

function mergePatch<T extends object>(base: T | undefined, patch: Record<string, unknown>): T {
  const merged = mergePatchValue(base, patch);
  return (merged && isRecord(merged) ? merged : {}) as unknown as T;
}

function omitResponsive(node: DesignNodeV1): DesignNodeV1 {
  const { responsive: _omit, ...rest } = node;
  return rest as DesignNodeV1;
}

function omitMotionRefs(node: DesignNodeV1): DesignNodeV1 {
  const { motionRefs: _omit, ...rest } = node;
  return rest as DesignNodeV1;
}

function deepEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function diffObject(base: unknown, next: unknown): unknown {
  if (deepEqual(base, next)) return undefined;
  if (!isRecord(base) || !isRecord(next)) return next;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    const d = diffObject((base as Record<string, unknown>)[k], v);
    if (d !== undefined) out[k] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

function setNode(document: DesignDocumentV1, node: DesignNodeV1): DesignDocumentV1 {
  const next = cloneDocument(document);
  next.nodesById[node.id] = node;
  return next;
}

function findParentInfo(
  document: DesignDocumentV1,
  childId: DesignNodeId,
): { parentId: DesignNodeId; index: number } | null {
  const root = document.nodesById[document.rootId];
  if (!root || root.type !== "page_root") return null;

  const stack: DesignNodeId[] = [root.id];
  while (stack.length) {
    const parentId = stack.pop();
    if (!parentId) continue;
    const parent = document.nodesById[parentId];
    if (!parent || !isContainerNode(parent)) continue;
    for (let i = 0; i < parent.children.length; i += 1) {
      const id = parent.children[i];
      if (!id) continue;
      if (id === childId) return { parentId: parent.id, index: i };
      stack.push(id);
    }
  }
  return null;
}

function removeSubtree(document: DesignDocumentV1, rootId: DesignNodeId): DesignDocumentV1 {
  const next = cloneDocument(document);
  const stack: DesignNodeId[] = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const node = next.nodesById[id];
    if (!node) continue;
    if (isContainerNode(node)) {
      for (const child of node.children) stack.push(child);
    }
    if (node.type === "prefab_instance" && node.slotChildren) {
      for (const ids of Object.values(node.slotChildren)) {
        for (const cid of ids) stack.push(cid);
      }
    }
    delete next.nodesById[id];
  }
  return next;
}

function insertChildId(args: {
  document: DesignDocumentV1;
  parentId: DesignNodeId;
  childId: DesignNodeId;
  index: number;
}): DesignDocumentV1 {
  const parent = args.document.nodesById[args.parentId];
  if (!parent || !isContainerNode(parent)) return args.document;
  const nextParent: DesignContainerNodeV1 = { ...parent, children: [...parent.children] };
  const idx = Math.max(0, Math.min(nextParent.children.length, args.index));
  nextParent.children.splice(idx, 0, args.childId);
  return setNode(args.document, nextParent);
}

function pushHistory(history: EditorDocumentHistory, doc: DesignDocumentV1): EditorDocumentHistory {
  const past = [...history.past, history.present];
  const limit = history.limit;
  const trimmed = past.length > limit ? past.slice(past.length - limit) : past;
  return { ...history, past: trimmed, present: doc, future: [] };
}

export function createEditorHistory(args: {
  initialDocument: DesignDocumentV1;
  limit?: number;
}): EditorDocumentHistory {
  return {
    past: [],
    present: cloneDocument(args.initialDocument),
    future: [],
    limit: args.limit ?? HISTORY_LIMIT_DEFAULT,
  };
}

export function toEditorHistoryState(history: EditorDocumentHistory): EditorHistoryState {
  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoDepth: history.past.length,
    redoDepth: history.future.length,
  };
}

export function undoEditorHistory(history: EditorDocumentHistory): EditorDocumentHistory {
  if (history.past.length === 0) return history;
  const prev = history.past[history.past.length - 1];
  if (!prev) return history;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: prev,
    future: [history.present, ...history.future],
  };
}

export function redoEditorHistory(history: EditorDocumentHistory): EditorDocumentHistory {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  if (!next) return history;
  return {
    ...history,
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function commitEditorHistory(
  history: EditorDocumentHistory,
  nextDocument: DesignDocumentV1,
): EditorDocumentHistory {
  if (deepEqual(history.present, nextDocument)) return history;
  return pushHistory(history, nextDocument);
}

function buildNodeByInsertType(type: string): DesignNodeV1 | null {
  const id = createNodeId();

  if (type === "frame") {
    return {
      id,
      type: "frame",
      name: "Frame",
      children: [],
      layout: defaultRectLayout(0, 0, 320, 200),
      style: defaultStyle(),
    };
  }
  if (type === "group") {
    return {
      id,
      type: "group",
      name: "Group",
      children: [],
      layout: defaultRectLayout(0, 0, 320, 200),
      style: defaultStyle(),
    };
  }
  if (type === "rect") {
    return {
      id,
      type: "rect",
      name: "Rect",
      layout: defaultRectLayout(0, 0, 120, 120),
      style: { backgroundColor: "#ddd" },
    };
  }
  if (type === "text") {
    return {
      id,
      type: "text",
      name: "Text",
      text: { "en-US": "Text", "zh-CN": "文本" },
      tag: "p",
      layout: defaultRectLayout(0, 0, 240, 40),
      style: { typography: { fontSize: 16, lineHeight: 20 } },
    };
  }
  if (type === "image") {
    return {
      id,
      type: "image",
      name: "Image",
      src: "",
      alt: { "en-US": "Image", "zh-CN": "图片" },
      objectFit: "cover",
      layout: defaultRectLayout(0, 0, 240, 180),
      style: defaultStyle(),
    };
  }
  if (type === "embed") {
    return {
      id,
      type: "embed",
      name: "Embed",
      url: "",
      layout: defaultRectLayout(0, 0, 320, 180),
      style: defaultStyle(),
    };
  }

  if (isPrefabInspectorType(type)) {
    const prefabId = prefabIdFromInspectorType(type);
    if (!prefabId) return null;
    const manifest = findManifestByType(type);

    const props: Record<string, DesignValueV1> = {};
    for (const field of manifest?.attributes ?? []) {
      props[field.key] = { kind: "literal", value: field.default };
    }

    const node: DesignPrefabInstanceNodeV1 = {
      id,
      type: "prefab_instance",
      name: `Prefab(${prefabId})`,
      prefabId,
      props,
      slotChildren: {},
      layout: defaultRectLayout(0, 0, 360, 240),
      style: defaultStyle(),
    };
    return node;
  }

  return null;
}

function normalizeInsertTarget(args: {
  document: DesignDocumentV1;
  targetId: BlockId | null | undefined;
  position: EditorInsertBlockPosition | undefined;
}): { parentId: DesignNodeId; index: number } | null {
  const root = args.document.nodesById[args.document.rootId];
  if (!root || root.type !== "page_root") return null;

  const position = args.position ?? "inside";
  const targetId = args.targetId ?? null;

  if (!targetId) {
    // Insert into page root as last child.
    return { parentId: root.id, index: root.children.length };
  }

  const target = args.document.nodesById[targetId];
  if (!target) return null;

  if (position === "inside" && isContainerNode(target)) {
    return { parentId: target.id, index: target.children.length };
  }

  const parentInfo = findParentInfo(args.document, target.id);
  if (!parentInfo) return null;

  if (position === "before") return { parentId: parentInfo.parentId, index: parentInfo.index };
  if (position === "after") return { parentId: parentInfo.parentId, index: parentInfo.index + 1 };
  // "inside" but target not container: fallback to after
  return { parentId: parentInfo.parentId, index: parentInfo.index + 1 };
}

export function insertBlockWithMeta(args: {
  document: DesignDocumentV1;
  insert: EditorInsertBlockArgs;
}): {
  document: DesignDocumentV1;
  selectedId: BlockId;
  inspector: EditorSelectionInspector;
  layers: EditorLayerNode[];
} {
  const next = cloneDocument(args.document);

  const insertType = (args.insert.type || "").trim();
  const node = buildNodeByInsertType(insertType);
  if (!node) {
    const inspector = buildSelectionInspector(next, null);
    return { document: next, selectedId: "", inspector, layers: buildLayerTree(next) };
  }

  const target = normalizeInsertTarget({
    document: next,
    targetId: args.insert.targetBlockId,
    position: args.insert.position,
  });
  if (!target) {
    const inspector = buildSelectionInspector(next, null);
    return { document: next, selectedId: "", inspector, layers: buildLayerTree(next) };
  }

  next.nodesById[node.id] = node;
  const withChild = insertChildId({
    document: next,
    parentId: target.parentId,
    childId: node.id,
    index: target.index,
  });

  const inspector = buildSelectionInspector(withChild, node.id);
  return { document: withChild, selectedId: node.id, inspector, layers: buildLayerTree(withChild) };
}

export function insertBlockTreeWithMeta(args: {
  document: DesignDocumentV1;
  insert: EditorInsertBlockTreeArgs;
}): {
  document: DesignDocumentV1;
  selectedId: BlockId;
  inspector: EditorSelectionInspector;
  layers: EditorLayerNode[];
} {
  const next = cloneDocument(args.document);
  const fragment =
    "rootIds" in args.insert && "nodesById" in args.insert
      ? { rootIds: args.insert.rootIds, nodesById: args.insert.nodesById }
      : convertLegacyBlocksToDesignFragment(args.insert.blocks);
  const rootIds = fragment.rootIds;
  const incoming = fragment.nodesById;

  for (const [id, node] of Object.entries(incoming) as Array<[DesignNodeId, DesignNodeV1]>) {
    next.nodesById[id] = node;
  }

  const target = normalizeInsertTarget({
    document: next,
    targetId: args.insert.targetBlockId,
    position: args.insert.position,
  });
  if (!target) {
    const inspector = buildSelectionInspector(next, null);
    return { document: next, selectedId: "", inspector, layers: buildLayerTree(next) };
  }

  let insertedFirst: string | null = null;
  let doc: DesignDocumentV1 = next;
  for (let i = 0; i < rootIds.length; i += 1) {
    const id = rootIds[i];
    if (!id) continue;
    if (!doc.nodesById[id]) continue;
    if (!insertedFirst) insertedFirst = id;
    doc = insertChildId({
      document: doc,
      parentId: target.parentId,
      childId: id,
      index: target.index + i,
    });
  }

  const selected = insertedFirst ?? "";
  const inspector = selected
    ? buildSelectionInspector(doc, selected)
    : buildSelectionInspector(doc, null);
  return { document: doc, selectedId: selected, inspector, layers: buildLayerTree(doc) };
}

export function deleteBlock(args: { document: DesignDocumentV1; blockId: BlockId }): {
  document: DesignDocumentV1;
  layers: EditorLayerNode[];
} {
  const node = args.document.nodesById[args.blockId];
  if (!node) return { document: args.document, layers: buildLayerTree(args.document) };
  if (node.id === args.document.rootId)
    return { document: args.document, layers: buildLayerTree(args.document) };

  const parentInfo = findParentInfo(args.document, node.id);
  if (!parentInfo) return { document: args.document, layers: buildLayerTree(args.document) };

  let next = cloneDocument(args.document);
  const parent = next.nodesById[parentInfo.parentId] as DesignContainerNodeV1 | undefined;
  if (!parent || !isContainerNode(parent))
    return { document: args.document, layers: buildLayerTree(args.document) };

  const nextParent: DesignContainerNodeV1 = { ...parent, children: [...parent.children] };
  nextParent.children.splice(parentInfo.index, 1);
  next = setNode(next, nextParent);
  next = removeSubtree(next, node.id);

  return { document: next, layers: buildLayerTree(next) };
}

export function moveBlock(args: {
  document: DesignDocumentV1;
  blockId: BlockId;
  targetId: BlockId;
  position: "before" | "after" | "inside";
}): { document: DesignDocumentV1; layers: EditorLayerNode[] } {
  const node = args.document.nodesById[args.blockId];
  if (!node) return { document: args.document, layers: buildLayerTree(args.document) };
  if (node.id === args.document.rootId)
    return { document: args.document, layers: buildLayerTree(args.document) };
  if (args.blockId === args.targetId)
    return { document: args.document, layers: buildLayerTree(args.document) };

  const from = findParentInfo(args.document, node.id);
  if (!from) return { document: args.document, layers: buildLayerTree(args.document) };

  const to = normalizeInsertTarget({
    document: args.document,
    targetId: args.targetId,
    position: args.position === "inside" ? "inside" : args.position,
  });
  if (!to) return { document: args.document, layers: buildLayerTree(args.document) };

  let next = cloneDocument(args.document);

  // Remove from old parent
  const oldParent = next.nodesById[from.parentId];
  if (!oldParent || !isContainerNode(oldParent))
    return { document: args.document, layers: buildLayerTree(args.document) };
  const patchedOld: DesignContainerNodeV1 = { ...oldParent, children: [...oldParent.children] };
  patchedOld.children.splice(from.index, 1);
  next = setNode(next, patchedOld);

  // Insert into new parent
  next = insertChildId({
    document: next,
    parentId: to.parentId,
    childId: node.id,
    index: to.index,
  });

  return { document: next, layers: buildLayerTree(next) };
}

export function duplicateBlockWithMeta(args: { document: DesignDocumentV1; blockId: BlockId }): {
  document: DesignDocumentV1;
  selectedId: BlockId;
  inspector: EditorSelectionInspector;
  layers: EditorLayerNode[];
} {
  const node = args.document.nodesById[args.blockId];
  if (!node) {
    const inspector = buildSelectionInspector(args.document, null);
    return {
      document: args.document,
      selectedId: "",
      inspector,
      layers: buildLayerTree(args.document),
    };
  }

  const parentInfo = findParentInfo(args.document, node.id);
  if (!parentInfo) {
    const inspector = buildSelectionInspector(args.document, null);
    return {
      document: args.document,
      selectedId: "",
      inspector,
      layers: buildLayerTree(args.document),
    };
  }

  // Shallow clone subtree by JSON; regenerate ids to keep uniqueness.
  const next = cloneDocument(args.document);

  const idMap = new Map<string, string>();
  const mapId = (old: string) => {
    const found = idMap.get(old);
    if (found) return found;
    const created = createNodeId();
    idMap.set(old, created);
    return created;
  };

  const stack: DesignNodeId[] = [node.id];
  const order: DesignNodeId[] = [];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    const cur = next.nodesById[id];
    if (!cur) continue;
    if (isContainerNode(cur)) {
      for (const child of cur.children) stack.push(child);
    }
    if (cur.type === "prefab_instance" && cur.slotChildren) {
      for (const ids of Object.values(cur.slotChildren)) for (const cid of ids) stack.push(cid);
    }
  }

  for (const oldId of order) {
    const oldNode = next.nodesById[oldId];
    if (!oldNode) continue;
    const cloned = cloneJson(oldNode) as DesignNodeV1;
    const newId = mapId(oldId);
    (cloned as { id: string }).id = newId;

    if (isContainerNode(cloned)) {
      cloned.children = cloned.children.map((cid) => mapId(cid));
    }
    if (cloned.type === "prefab_instance" && cloned.slotChildren) {
      const slots: Record<string, string[]> = {};
      for (const [name, ids] of Object.entries(cloned.slotChildren)) {
        slots[name] = ids.map((cid) => mapId(cid));
      }
      cloned.slotChildren = slots;
    }

    next.nodesById[newId] = cloned;
  }

  const newRootId = mapId(node.id);
  const inserted = insertChildId({
    document: next,
    parentId: parentInfo.parentId,
    childId: newRootId,
    index: parentInfo.index + 1,
  });

  const inspector = buildSelectionInspector(inserted, newRootId);
  return { document: inserted, selectedId: newRootId, inspector, layers: buildLayerTree(inserted) };
}

export function applySelectionPatch(args: {
  document: DesignDocumentV1;
  blockId: BlockId | null;
  patch: EditorSelectionPatch;
}): { document: DesignDocumentV1; inspector: EditorSelectionInspector } {
  const { document, blockId, patch } = args;
  if (!blockId) return { document, inspector: buildSelectionInspector(document, null) };
  const node = document.nodesById[blockId];
  if (!node) return { document, inspector: buildSelectionInspector(document, null) };

  const section = patch.section;
  const values = patch.values ?? {};

  const updated = (() => {
    if (section === "layout") {
      return { ...node, layout: mergePatch<DesignLayoutV1>(node.layout, values) };
    }
    if (section === "design") {
      if (node.type === "prefab_instance") {
        const manifest = findManifestByType(`prefab:${node.prefabId}`);
        const allow = new Set(manifest?.styleOverrideWhitelist ?? []);
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(values)) {
          if (!allow.has(k)) continue;
          filtered[k] = v;
        }
        return { ...node, style: mergePatch<DesignStyleV1>(node.style, filtered) };
      }
      return { ...node, style: mergePatch<DesignStyleV1>(node.style, values) };
    }
    if (section === "animation") {
      // v1：先把 motionRefs 当作不透明结构传递，阶段 4 会替换为明确 schema。
      if (values.motionRefs === null) return omitMotionRefs(node);
      if (isMotionRefsV1(values.motionRefs)) return { ...node, motionRefs: values.motionRefs };
      return node;
    }
    // component
    if (node.type === "page_root") {
      const nextTitle = values.title;
      const nextDescription = values.description;
      const nextDataSources = values.dataSources;

      const seoChanged = nextTitle !== undefined || nextDescription !== undefined;
      const nextSeoBase = { ...node.seo } as Record<string, unknown>;
      if (nextTitle === null) delete nextSeoBase.title;
      else if (nextTitle !== undefined)
        nextSeoBase.title = nextTitle as unknown as NonNullable<typeof node.seo>["title"];
      if (nextDescription === null) delete nextSeoBase.description;
      else if (nextDescription !== undefined)
        nextSeoBase.description = nextDescription as unknown as NonNullable<
          typeof node.seo
        >["description"];
      return {
        ...node,
        ...(seoChanged
          ? {
              seo: nextSeoBase as unknown as NonNullable<typeof node.seo>,
            }
          : {}),
        ...(nextDataSources !== undefined
          ? { dataSources: nextDataSources as unknown as typeof node.dataSources }
          : {}),
      };
    }
    if (node.type === "text") {
      const nextText = values.text;
      const nextTag = values.tag;
      const nextAlign = values.align;
      return {
        ...node,
        ...(nextText !== undefined ? { text: nextText as unknown as typeof node.text } : {}),
        ...(typeof nextTag === "string" ? { tag: nextTag as unknown as typeof node.tag } : {}),
        ...(typeof nextAlign === "string"
          ? { align: nextAlign as unknown as typeof node.align }
          : {}),
      };
    }
    if (node.type === "image") {
      const nextSrc = values.src;
      const nextAlt = values.alt;
      const nextFit = values.objectFit;
      return {
        ...node,
        ...(nextSrc !== undefined ? { src: nextSrc as unknown as typeof node.src } : {}),
        ...(nextAlt !== undefined ? { alt: nextAlt as unknown as typeof node.alt } : {}),
        ...(typeof nextFit === "string"
          ? { objectFit: nextFit as unknown as typeof node.objectFit }
          : {}),
      };
    }
    if (node.type === "embed") {
      const nextUrl = values.url;
      return {
        ...node,
        ...(nextUrl !== undefined ? { url: nextUrl as unknown as typeof node.url } : {}),
      };
    }
    if (node.type === "prefab_instance") {
      const manifest = findManifestByType(`prefab:${node.prefabId}`);
      const fields = new Map<string, FieldDefinition>(
        (manifest?.attributes ?? []).map((f) => [f.key, f]),
      );
      const incomingProps = isRecord(values.props) ? (values.props as Record<string, unknown>) : {};
      const nextProps: Record<string, DesignValueV1> = { ...node.props };
      for (const [k, v] of Object.entries(incomingProps)) {
        const field = fields.get(k);
        if (!field) continue;
        const nextValue =
          isRecord(v) && v.kind === "binding" ? (v as unknown as DesignValueV1) : toLiteralValue(v);
        if (nextValue.kind === "literal" && !validateFieldValue(field, nextValue.value)) continue;
        nextProps[k] = nextValue;
      }
      return { ...node, props: nextProps };
    }
    return node;
  })();

  const nextDocument = setNode(document, updated);
  return { document: nextDocument, inspector: buildSelectionInspector(nextDocument, updated.id) };
}

export function buildSelectionInspectorForBreakpoint(args: {
  document: DesignDocumentV1;
  blockId: BlockId | null;
  breakpoint: string;
}): EditorSelectionInspector {
  if (!args.blockId) return buildSelectionInspector(args.document, null);
  const base = args.document.nodesById[args.blockId];
  if (!base) return buildSelectionInspector(args.document, null);

  const resolved = resolveDesignNodeAtBreakpointV1({ node: base, breakpoint: args.breakpoint });
  return {
    blockId: resolved.id,
    blockType: resolveInspectorType(resolved),
    component: buildComponentInspector(resolved),
    layout: buildLayoutInspector(resolved),
    design: buildDesignInspector(resolved),
    animation: buildAnimationInspector(resolved),
  };
}

export function setBreakpointOverride(args: {
  document: DesignDocumentV1;
  blockId: BlockId;
  breakpoint: string;
  patch: EditorSelectionPatch;
}): { document: DesignDocumentV1; inspector: EditorSelectionInspector } {
  const bp = (args.breakpoint || "").trim() as BreakpointName;
  if (!bp)
    return {
      document: args.document,
      inspector: buildSelectionInspector(args.document, args.blockId),
    };

  const node = args.document.nodesById[args.blockId];
  if (!node)
    return { document: args.document, inspector: buildSelectionInspector(args.document, null) };

  const responsive = { ...node.responsive };
  const current = (responsive[bp] ?? {}) as DesignNodeResponsiveOverrideV1;

  const section: EditorSelectionPatchSection = args.patch.section;
  const values = args.patch.values ?? {};

  const nextOverride: DesignNodeResponsiveOverrideV1 = { ...current };
  if (section === "layout") {
    const merged = mergePatch<DesignLayoutV1>(
      resolveDesignNodeAtBreakpointV1({ node, breakpoint: bp }).layout,
      values,
    );
    const diff = diffObject(node.layout, merged);
    if (diff && isRecord(diff) && Object.keys(diff).length) {
      nextOverride.layout = diff as unknown as NonNullable<
        DesignNodeResponsiveOverrideV1["layout"]
      >;
    } else {
      delete nextOverride.layout;
    }
  } else if (section === "design") {
    const valuesForMerge = (() => {
      if (node.type !== "prefab_instance") return values;
      const manifest = findManifestByType(`prefab:${node.prefabId}`);
      const allow = new Set(manifest?.styleOverrideWhitelist ?? []);
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (!allow.has(k)) continue;
        filtered[k] = v;
      }
      return filtered;
    })();

    const merged = mergePatch<DesignStyleV1>(
      resolveDesignNodeAtBreakpointV1({ node, breakpoint: bp }).style,
      valuesForMerge,
    );
    const diff = diffObject(node.style, merged);
    if (diff && isRecord(diff) && Object.keys(diff).length) {
      nextOverride.style = diff as unknown as NonNullable<DesignNodeResponsiveOverrideV1["style"]>;
    } else {
      delete nextOverride.style;
    }
  } else if (section === "animation") {
    // motionRefs 在 v1 允许 override，但目前 UI 尚未实现。
    if (values.motionRefs === null) delete nextOverride.motionRefs;
    else if (isMotionRefsV1(values.motionRefs)) nextOverride.motionRefs = values.motionRefs;
  } else {
    // component 不属于 visual override 范围（v1 只支持 layout/style/transform/motionRefs）。
  }

  // 清理空 override，保证只存差异字段。
  const cleaned: DesignNodeResponsiveOverrideV1 = {};
  if (
    nextOverride.layout &&
    isRecord(nextOverride.layout) &&
    Object.keys(nextOverride.layout).length
  )
    cleaned.layout = nextOverride.layout;
  if (nextOverride.style && isRecord(nextOverride.style) && Object.keys(nextOverride.style).length)
    cleaned.style = nextOverride.style;
  if (
    nextOverride.transform &&
    isRecord(nextOverride.transform) &&
    Object.keys(nextOverride.transform).length
  )
    cleaned.transform = nextOverride.transform;
  if (Array.isArray(nextOverride.motionRefs) && nextOverride.motionRefs.length)
    cleaned.motionRefs = nextOverride.motionRefs;

  if (Object.keys(cleaned).length === 0) {
    delete responsive[bp];
  } else {
    responsive[bp] = cleaned;
  }

  const responsiveOut =
    isRecord(responsive) && Object.keys(responsive).length ? responsive : undefined;
  const updatedNode: DesignNodeV1 = responsiveOut
    ? { ...node, responsive: responsiveOut }
    : omitResponsive(node);
  const nextDocument = setNode(args.document, updatedNode);
  return { document: nextDocument, inspector: buildSelectionInspector(nextDocument, args.blockId) };
}

export function createInsertBlockResult(args: {
  document: DesignDocumentV1;
  blockId: BlockId;
}): EditorInsertBlockResult {
  return {
    blockId: args.blockId,
    inspector: buildSelectionInspector(args.document, args.blockId),
    layers: buildLayerTree(args.document),
  };
}

export function normalizeInitialDocument(value: unknown): DesignDocumentV1 {
  if (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.rootId === "string" &&
    isRecord(value.nodesById)
  ) {
    return value as unknown as DesignDocumentV1;
  }
  return buildEmptyDocument();
}
