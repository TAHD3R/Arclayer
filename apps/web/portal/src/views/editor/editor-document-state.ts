import type {
  EditorHistoryState,
  EditorInsertBlockArgs,
  EditorInsertBlockPosition,
  EditorInsertBlockTreeArgs,
  EditorInsertBlockResult,
  EditorLayerNode,
  EditorSelectionInspector,
  EditorSelectionPatch,
} from "@celestial/site-editor-protocol";
import { EDITOR_PAGE_ROOT_BLOCK_ID } from "@celestial/site-editor-protocol";

import type {
  BlockNode,
  DesignBlockNodeV1,
  DesignDocumentV1,
  DesignNodeId,
  DesignNodeV1,
} from "@celestial/site-block-protocol";
import {
  CORE_BLOCK_MANIFESTS,
  PREFAB_BLOCK_MANIFESTS,
  type BlockManifest,
  type FieldDefinition,
} from "@celestial/site-block-protocol";

import { PREFAB_INSTANCE_BLOCK_TYPE } from "@celestial/site-renderer-core";

const HISTORY_LIMIT_DEFAULT = 100;

const COMPONENT_META_KEYS = new Set(["layout", "style", "animation"]);

const PREFAB_INSPECTOR_PREFIX = "prefab:";

const MANIFEST_BY_TYPE = new Map<string, BlockManifest>(
  [...CORE_BLOCK_MANIFESTS, ...PREFAB_BLOCK_MANIFESTS].map((m) => [m.type, m]),
);

function isLocalizedStringMap(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  for (const v of Object.values(value)) {
    if (v === undefined) continue;
    if (typeof v !== "string") return false;
  }
  return true;
}

function findManifestByType(type: string): BlockManifest | null {
  const normalized = (type || "").trim();
  if (!normalized) return null;
  return MANIFEST_BY_TYPE.get(normalized) ?? null;
}

function parsePrefabCodeFromInspectorType(type: string): string | null {
  const raw = (type || "").trim();
  if (!raw.startsWith(PREFAB_INSPECTOR_PREFIX)) return null;
  const code = raw.slice(PREFAB_INSPECTOR_PREFIX.length).trim();
  return code ? code : null;
}

function prefabInspectorTypeFromCode(code: string): string {
  return `${PREFAB_INSPECTOR_PREFIX}${code}`;
}

function validateFieldValue(field: FieldDefinition, value: unknown): boolean {
  // undefined 会被 mergePropsRecord 忽略；null 表示删除（required 字段不允许删除）
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
      return typeof value === "string" || isLocalizedStringMap(value);
    case "color":
    case "url":
      return typeof value === "string";
    default:
      return true;
  }
}

function filterComponentPatchByManifest(
  values: Record<string, unknown>,
  manifest: BlockManifest | null,
): Record<string, unknown> {
  if (!manifest) return values;
  const fields = new Map<string, FieldDefinition>(manifest.attributes.map((f) => [f.key, f]));

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key);
    if (!field) continue;
    if (!validateFieldValue(field, value)) continue;
    out[key] = value;
  }
  return out;
}

function filterDesignPatchByWhitelist(
  values: Record<string, unknown>,
  whitelist: string[] | undefined,
): Record<string, unknown> {
  if (!Array.isArray(whitelist) || whitelist.length === 0) return values;
  const allow = new Set(whitelist);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    // 允许删除任何字段（回到 prefab 内部默认），但只允许设置白名单字段
    if (value === null || allow.has(key)) out[key] = value;
  }
  return out;
}

type EditorDocumentHistory = {
  past: DesignDocumentV1[];
  present: DesignDocumentV1;
  future: DesignDocumentV1[];
  limit: number;
};

type UpdateNodeResult = {
  document: DesignDocumentV1;
  changed: boolean;
};

type InsertChildrenResult = {
  document: DesignDocumentV1;
  inserted: boolean;
};

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneDocument(doc: DesignDocumentV1): DesignDocumentV1 {
  return cloneJson(doc);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return value;
}

function localizedTextFromProps(value: unknown): string {
  if (!isRecord(value)) return "";
  return Object.values(value).find((item): item is string => typeof item === "string") ?? "";
}

function sanitizeLocalizedStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function isPageNode(
  node: DesignNodeV1 | undefined,
): node is Extract<DesignNodeV1, { type: "page" }> {
  return node !== undefined && node.type === "page";
}

function isBlockNode(node: DesignNodeV1 | undefined): node is DesignBlockNodeV1 {
  return node !== undefined && node.type !== "page";
}

function isParentBlockType(type: string): boolean {
  // Keep v1 aligned with current core blocks.
  return type === "container" || type === "grid" || type === PREFAB_INSTANCE_BLOCK_TYPE;
}

function getNodeChildren(node: DesignNodeV1): DesignNodeId[] {
  if (isPageNode(node)) return node.children;
  return Array.isArray(node.children) ? node.children : [];
}

function withNodeChildren(node: DesignNodeV1, children: DesignNodeId[]): DesignNodeV1 {
  if (isPageNode(node)) {
    return { ...node, children };
  }
  return { ...node, children };
}

function findParentInfo(
  document: DesignDocumentV1,
  childId: DesignNodeId,
): { parentId: DesignNodeId; index: number } | null {
  const root = document.nodesById[document.rootId];
  if (!isPageNode(root)) return null;

  const stack: DesignNodeId[] = [root.id];
  while (stack.length) {
    const parentId = stack.pop();
    if (!parentId) continue;
    const parent = document.nodesById[parentId];
    if (!parent) continue;
    const children = getNodeChildren(parent);

    for (let index = 0; index < children.length; index += 1) {
      const id = children[index];
      if (!id) continue;
      if (id === childId) return { parentId, index };

      const node = document.nodesById[id];
      if (!isBlockNode(node)) continue;
      if (Array.isArray(node.children) && node.children.length) {
        stack.push(node.id);
      }
    }
  }

  return null;
}

function collectSubtreeIds(document: DesignDocumentV1, rootId: DesignNodeId): DesignNodeId[] {
  const out: DesignNodeId[] = [];
  const stack: DesignNodeId[] = [rootId];
  const seen = new Set<DesignNodeId>();

  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);

    const node = document.nodesById[id];
    if (!isBlockNode(node)) continue;
    const children = Array.isArray(node.children) ? node.children : [];
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return out;
}

function containsNodeId(
  document: DesignDocumentV1,
  rootId: DesignNodeId,
  candidateId: DesignNodeId,
): boolean {
  if (rootId === candidateId) return true;
  const subtree = collectSubtreeIds(document, rootId);
  return subtree.includes(candidateId);
}

function updateNodeById(
  document: DesignDocumentV1,
  nodeId: DesignNodeId,
  updater: (node: DesignNodeV1) => DesignNodeV1,
): UpdateNodeResult {
  const current = document.nodesById[nodeId];
  if (!current) return { document, changed: false };

  const nextNode = updater(current);
  if (nextNode === current) return { document, changed: false };

  return {
    document: {
      ...document,
      nodesById: {
        ...document.nodesById,
        [nodeId]: nextNode,
      },
    },
    changed: true,
  };
}

function updateChildren(
  document: DesignDocumentV1,
  parentId: DesignNodeId,
  updater: (children: DesignNodeId[]) => DesignNodeId[],
): UpdateNodeResult {
  const parent = document.nodesById[parentId];
  if (!parent) return { document, changed: false };

  // Only update children for known parent nodes.
  if (parent.type !== "page" && !isParentBlockType(parent.type)) {
    return { document, changed: false };
  }

  const currentChildren = getNodeChildren(parent);
  const nextChildren = updater(currentChildren);
  if (nextChildren === currentChildren) return { document, changed: false };

  return updateNodeById(document, parentId, (node) => withNodeChildren(node, nextChildren));
}

function insertInsideTarget(
  document: DesignDocumentV1,
  targetId: DesignNodeId,
  newIds: DesignNodeId[],
): InsertChildrenResult {
  if (newIds.length === 0) return { document, inserted: false };

  const updated = updateChildren(document, targetId, (children) => [...children, ...newIds]);
  return { document: updated.document, inserted: updated.changed };
}

function insertRelativeToTarget(
  document: DesignDocumentV1,
  targetId: DesignNodeId,
  newIds: DesignNodeId[],
  position: "before" | "after",
): InsertChildrenResult {
  if (newIds.length === 0) return { document, inserted: false };

  const parentInfo = findParentInfo(document, targetId);
  if (!parentInfo) return { document, inserted: false };

  const updated = updateChildren(document, parentInfo.parentId, (children) => {
    const next = [...children];
    const at = position === "before" ? parentInfo.index : parentInfo.index + 1;
    next.splice(at, 0, ...newIds);
    return next;
  });

  return { document: updated.document, inserted: updated.changed };
}

function mergePropsRecord(
  source: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...source };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (value === null) {
      delete next[key];
      continue;
    }
    next[key] = value;
  }
  return next;
}

function mergeNestedProps(
  source: Record<string, unknown>,
  key: "layout" | "style" | "animation",
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...source };
  const current = asRecord(next[key]);
  next[key] = mergePropsRecord(current, values);
  return next;
}

function componentSectionFromProps(props: Record<string, unknown>): Record<string, unknown> {
  const section: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (COMPONENT_META_KEYS.has(key)) continue;
    section[key] = value;
  }
  return section;
}

function buildLayerLabel(node: DesignBlockNodeV1): string {
  const props = node.props;

  switch (node.type) {
    case PREFAB_INSTANCE_BLOCK_TYPE: {
      const record = asRecord(props);
      const code = typeof record.prefab === "string" ? record.prefab.trim() : "";
      const prefabProps = asRecord(record.props);
      const title = localizedTextFromProps(prefabProps.title);
      const base = code ? `Prefab(${code})` : "Prefab";
      return title ? `${base}: ${title}` : base;
    }
    case "heading": {
      const text = localizedTextFromProps(props.text);
      return text ? `Heading: ${text}` : "Heading";
    }
    case "paragraph": {
      const text = localizedTextFromProps(props.text);
      return text ? `Paragraph: ${text}` : "Paragraph";
    }
    case "button": {
      const text = localizedTextFromProps(props.text);
      return text ? `Button: ${text}` : "Button";
    }
    case "quote": {
      const text = localizedTextFromProps(props.text);
      return text ? `Quote: ${text}` : "Quote";
    }
    case "divider":
      return "Divider";
    case "container":
      return "Container";
    case "grid":
      return "Grid";
    case "list":
      return "List";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "spacer":
      return "Spacer";
    case "icon": {
      const name = typeof props.name === "string" ? props.name : "";
      return name.trim() ? `Icon: ${name}` : "Icon";
    }
  }

  return node.type;
}

function generateBlockId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function localized(en: string, zh: string): Record<string, string> {
  return { "en-US": en, "zh-CN": zh };
}

function buildDesignBlockByType(type: EditorInsertBlockArgs["type"]): DesignBlockNodeV1 {
  const id = generateBlockId();

  const prefabCode = parsePrefabCodeFromInspectorType(type);
  if (prefabCode) {
    const defaultPrefabProps: Record<string, unknown> =
      prefabCode === "card"
        ? {
            title: localized("Card", "卡片"),
            description: localized("Description", "描述"),
            imageSrc: "",
            href: "",
          }
        : {};

    return {
      id,
      type: PREFAB_INSTANCE_BLOCK_TYPE,
      props: {
        prefab: prefabCode,
        props: defaultPrefabProps,
        layout: { width: "100%" },
      },
      children: [],
    };
  }

  if (type === "container") {
    return {
      id,
      type,
      props: {
        as: "section",
        layout: {
          width: "100%",
          padding: "24px",
          display: "flex",
          direction: "column",
          gap: "12px",
        },
        style: {
          backgroundColor: "#ffffff",
          borderRadius: "12px",
        },
      },
      children: [],
    };
  }

  if (type === "grid") {
    return {
      id,
      type,
      props: {
        columns: 2,
        columnGap: "16px",
        rowGap: "16px",
      },
      children: [],
    };
  }

  if (type === "spacer") {
    return {
      id,
      type,
      props: {
        height: "24px",
      },
    };
  }

  if (type === "divider") {
    return {
      id,
      type,
      props: {
        variant: "default",
      },
    };
  }

  if (type === "heading") {
    return {
      id,
      type,
      props: {
        level: 2,
        text: localized("Heading", "标题"),
        align: "left",
      },
    };
  }

  if (type === "paragraph") {
    return {
      id,
      type,
      props: {
        text: localized("Paragraph", "段落"),
        align: "left",
      },
    };
  }

  if (type === "list") {
    return {
      id,
      type,
      props: {
        ordered: false,
        items: [localized("Item 1", "列表项 1"), localized("Item 2", "列表项 2")],
      },
    };
  }

  if (type === "quote") {
    return {
      id,
      type,
      props: {
        text: localized("Quote", "引用"),
        citation: localized("Source", "来源"),
      },
    };
  }

  if (type === "image") {
    return {
      id,
      type,
      props: {
        src: "",
        alt: "",
        objectFit: "cover",
      },
    };
  }

  if (type === "video") {
    return {
      id,
      type,
      props: {
        src: "",
        poster: "",
        autoplay: false,
        loop: false,
        muted: false,
      },
    };
  }

  if (type === "icon") {
    return {
      id,
      type,
      props: {
        name: "star",
        size: "24px",
      },
    };
  }

  if (type === "button") {
    return {
      id,
      type,
      props: {
        text: localized("Button", "按钮"),
        href: "",
        variant: "primary",
        size: "md",
      },
    };
  }

  return {
    id,
    type,
    props: {},
  };
}

type BlockTreeCloneResult = {
  rootIds: DesignNodeId[];
  nodesById: Record<DesignNodeId, DesignNodeV1>;
  selectedBlockId: DesignNodeId;
};

function cloneBlockTreeWithNewIds(blocks: BlockNode[]): BlockTreeCloneResult {
  if (blocks.length === 0) {
    throw new Error("insertBlockTree requires non-empty blocks");
  }

  const nodesById: Record<DesignNodeId, DesignNodeV1> = {};

  const cloneNode = (node: BlockNode): DesignNodeId => {
    const nextId = generateBlockId();
    const childIds = Array.isArray(node.children) ? node.children.map(cloneNode) : undefined;

    nodesById[nextId] = {
      id: nextId,
      type: node.type,
      props: cloneJson(node.props) as Record<string, unknown>,
      ...(childIds ? { children: childIds } : {}),
      ...(node.responsive ? { responsive: cloneJson(node.responsive) } : {}),
    };

    return nextId;
  };

  const rootIds = blocks.map(cloneNode);
  const selectedBlockId = rootIds[0];
  if (!selectedBlockId) {
    throw new Error("insertBlockTree failed to generate a selected block id");
  }

  return { rootIds, nodesById, selectedBlockId };
}

export function createEditorHistory(
  initialDocument: DesignDocumentV1,
  limit = HISTORY_LIMIT_DEFAULT,
): EditorDocumentHistory {
  return {
    past: [],
    present: cloneDocument(initialDocument),
    future: [],
    limit,
  };
}

export function commitEditorHistory(
  state: EditorDocumentHistory,
  nextDocument: DesignDocumentV1,
): EditorDocumentHistory {
  const nextPast = [...state.past, cloneDocument(state.present)];
  const overflow = Math.max(0, nextPast.length - state.limit);

  return {
    ...state,
    past: overflow > 0 ? nextPast.slice(overflow) : nextPast,
    present: cloneDocument(nextDocument),
    future: [],
  };
}

export function undoEditorHistory(state: EditorDocumentHistory): EditorDocumentHistory {
  if (!state.past.length) return state;

  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  const nextPast = state.past.slice(0, -1);
  return {
    ...state,
    past: nextPast,
    present: cloneDocument(previous),
    future: [cloneDocument(state.present), ...state.future],
  };
}

export function redoEditorHistory(state: EditorDocumentHistory): EditorDocumentHistory {
  if (!state.future.length) return state;

  const [next, ...restFuture] = state.future;
  if (!next) return state;
  return {
    ...state,
    past: [...state.past, cloneDocument(state.present)],
    present: cloneDocument(next),
    future: restFuture,
  };
}

export function toEditorHistoryState(state: EditorDocumentHistory): EditorHistoryState {
  return {
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoDepth: state.past.length,
    redoDepth: state.future.length,
  };
}

export function buildSelectionInspector(
  document: DesignDocumentV1,
  blockId: string | null,
): EditorSelectionInspector {
  if (!blockId) {
    return {
      blockId: null,
      blockType: null,
      component: {},
      layout: {},
      design: {},
      animation: {},
    };
  }

  if (blockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    const root = document.nodesById[document.rootId];
    const meta = isPageNode(root) ? asRecord(root.meta) : {};

    return {
      blockId: EDITOR_PAGE_ROOT_BLOCK_ID,
      blockType: "page",
      component: {
        title: sanitizeLocalizedStringMap(meta.title),
        description: sanitizeLocalizedStringMap(meta.description),
      },
      layout: asRecord(meta.layout),
      design: asRecord(meta.style),
      animation: asRecord(meta.animation),
    };
  }

  const node = document.nodesById[blockId];
  if (!isBlockNode(node)) {
    return {
      blockId: null,
      blockType: null,
      component: {},
      layout: {},
      design: {},
      animation: {},
    };
  }

  const props = asRecord(node.props);
  if (node.type === PREFAB_INSTANCE_BLOCK_TYPE) {
    const prefab = typeof props.prefab === "string" ? props.prefab.trim() : "";
    const inspectorType = prefab ? prefabInspectorTypeFromCode(prefab) : node.type;

    return {
      blockId: node.id,
      blockType: inspectorType,
      component: asRecord(props.props),
      layout: asRecord(props.layout),
      design: asRecord(props.style),
      animation: asRecord(props.animation),
    };
  }
  return {
    blockId: node.id,
    blockType: node.type,
    component: componentSectionFromProps(props),
    layout: asRecord(props.layout),
    design: asRecord(props.style),
    animation: asRecord(props.animation),
  };
}

export function buildSelectionInspectorForBreakpoint(
  document: DesignDocumentV1,
  blockId: string | null,
  breakpoint: string,
): EditorSelectionInspector {
  const base = buildSelectionInspector(document, blockId);
  if (!base.blockId || base.blockId === EDITOR_PAGE_ROOT_BLOCK_ID) return base;

  const node = document.nodesById[base.blockId];
  if (!isBlockNode(node)) return base;

  const bp = (breakpoint || "").trim();
  if (!bp) return base;

  const override = node.responsive?.[bp];
  if (!override) return base;

  const nextLayout = override.layout
    ? { ...base.layout, ...asRecord(override.layout) }
    : base.layout;
  const nextDesign = override.style ? { ...base.design, ...asRecord(override.style) } : base.design;
  const nextAnimation = override.animation
    ? { ...base.animation, ...asRecord(override.animation) }
    : base.animation;

  return {
    ...base,
    layout: nextLayout,
    design: nextDesign,
    animation: nextAnimation,
  };
}

export function applySelectionPatch(
  document: DesignDocumentV1,
  blockId: string | null,
  patch: EditorSelectionPatch,
): { document: DesignDocumentV1; inspector: EditorSelectionInspector } {
  if (!blockId) {
    return {
      document,
      inspector: buildSelectionInspector(document, null),
    };
  }

  if (blockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    const root = document.nodesById[document.rootId];
    if (!isPageNode(root)) {
      return {
        document,
        inspector: buildSelectionInspector(document, EDITOR_PAGE_ROOT_BLOCK_ID),
      };
    }

    const currentMeta = asRecord(root.meta);

    const nextMeta = (() => {
      if (patch.section === "component") {
        const nextComponent = mergePropsRecord(
          componentSectionFromProps(currentMeta),
          patch.values,
        );
        const merged: Record<string, unknown> = {
          ...nextComponent,
        };
        if (currentMeta.layout !== undefined) merged.layout = currentMeta.layout;
        if (currentMeta.style !== undefined) merged.style = currentMeta.style;
        if (currentMeta.animation !== undefined) merged.animation = currentMeta.animation;
        return merged;
      }

      if (patch.section === "layout") {
        return mergeNestedProps(currentMeta, "layout", patch.values);
      }

      if (patch.section === "design") {
        return mergeNestedProps(currentMeta, "style", patch.values);
      }

      return mergeNestedProps(currentMeta, "animation", patch.values);
    })();

    const updatedRoot = {
      ...root,
      meta: nextMeta,
    };

    const nextDocument = {
      ...document,
      nodesById: {
        ...document.nodesById,
        [root.id]: updatedRoot,
      },
    };

    return {
      document: nextDocument,
      inspector: buildSelectionInspector(nextDocument, EDITOR_PAGE_ROOT_BLOCK_ID),
    };
  }

  const node = document.nodesById[blockId];
  if (!isBlockNode(node)) {
    return {
      document,
      inspector: buildSelectionInspector(document, null),
    };
  }

  const currentProps = asRecord(node.props);

  const nextNode = (() => {
    if (patch.section === "component") {
      if (node.type === PREFAB_INSTANCE_BLOCK_TYPE) {
        const prefab = typeof currentProps.prefab === "string" ? currentProps.prefab.trim() : "";
        const manifest = prefab ? findManifestByType(prefabInspectorTypeFromCode(prefab)) : null;
        const filteredValues = filterComponentPatchByManifest(patch.values, manifest);
        const nextPrefabProps = mergePropsRecord(asRecord(currentProps.props), filteredValues);

        return {
          ...node,
          props: {
            ...currentProps,
            props: nextPrefabProps,
          },
        };
      }

      const manifest = findManifestByType(node.type);
      const filteredValues = filterComponentPatchByManifest(patch.values, manifest);
      const nextComponent = mergePropsRecord(
        componentSectionFromProps(currentProps),
        filteredValues,
      );
      const merged: Record<string, unknown> = {
        ...nextComponent,
      };
      if (currentProps.layout !== undefined) merged.layout = currentProps.layout;
      if (currentProps.style !== undefined) merged.style = currentProps.style;
      if (currentProps.animation !== undefined) merged.animation = currentProps.animation;
      return { ...node, props: merged };
    }

    if (patch.section === "layout") {
      return { ...node, props: mergeNestedProps(currentProps, "layout", patch.values) };
    }

    if (patch.section === "design") {
      if (node.type === PREFAB_INSTANCE_BLOCK_TYPE) {
        const prefab = typeof currentProps.prefab === "string" ? currentProps.prefab.trim() : "";
        const manifest = prefab ? findManifestByType(prefabInspectorTypeFromCode(prefab)) : null;
        const filteredValues = filterDesignPatchByWhitelist(
          patch.values,
          manifest?.styleOverrideWhitelist,
        );
        return { ...node, props: mergeNestedProps(currentProps, "style", filteredValues) };
      }

      return { ...node, props: mergeNestedProps(currentProps, "style", patch.values) };
    }

    return { ...node, props: mergeNestedProps(currentProps, "animation", patch.values) };
  })();

  const updated = updateNodeById(document, node.id, () => nextNode);
  if (!updated.changed) {
    return {
      document,
      inspector: buildSelectionInspector(document, blockId),
    };
  }

  return {
    document: updated.document,
    inspector: buildSelectionInspector(updated.document, blockId),
  };
}

function isEmptyRecordValue(value: unknown): boolean {
  if (!isRecord(value)) return true;
  return Object.keys(value).length === 0;
}

export function setBreakpointOverride(
  document: DesignDocumentV1,
  args: {
    blockId: string | null;
    breakpoint: string;
    patch: EditorSelectionPatch;
  },
): { document: DesignDocumentV1; inspector: EditorSelectionInspector } {
  const blockId = args.blockId;
  if (!blockId) {
    return { document, inspector: buildSelectionInspector(document, null) };
  }

  const bp = (args.breakpoint || "").trim();
  if (!bp) {
    return { document, inspector: buildSelectionInspector(document, blockId) };
  }

  if (blockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    // Page root 当前不支持 responsive override（后续 PageRoot 扩展时再接入）。
    return { document, inspector: buildSelectionInspector(document, EDITOR_PAGE_ROOT_BLOCK_ID) };
  }

  if (args.patch.section === "component") {
    // v1 仅允许响应式覆写 visual props（layout/design/animation），组件字段暂不支持。
    return { document, inspector: buildSelectionInspectorForBreakpoint(document, blockId, bp) };
  }

  const node = document.nodesById[blockId];
  if (!isBlockNode(node)) {
    return { document, inspector: buildSelectionInspector(document, null) };
  }

  const currentResponsive = node.responsive ? cloneJson(node.responsive) : {};
  const currentOverride = asRecord(currentResponsive[bp]);

  const nextOverride = (() => {
    if (args.patch.section === "layout") {
      const nextLayout = mergePropsRecord(asRecord(currentOverride.layout), args.patch.values);
      const out: Record<string, unknown> = { ...currentOverride, layout: nextLayout };
      if (isEmptyRecordValue(nextLayout)) delete out.layout;
      return out;
    }

    if (args.patch.section === "design") {
      const filteredValues =
        node.type === PREFAB_INSTANCE_BLOCK_TYPE
          ? (() => {
              const nodeProps = asRecord(node.props);
              const prefab = typeof nodeProps.prefab === "string" ? nodeProps.prefab.trim() : "";
              const manifest = prefab
                ? findManifestByType(prefabInspectorTypeFromCode(prefab))
                : null;
              return filterDesignPatchByWhitelist(
                args.patch.values,
                manifest?.styleOverrideWhitelist,
              );
            })()
          : args.patch.values;

      const nextStyle = mergePropsRecord(asRecord(currentOverride.style), filteredValues);
      const out: Record<string, unknown> = { ...currentOverride, style: nextStyle };
      if (isEmptyRecordValue(nextStyle)) delete out.style;
      return out;
    }

    const nextAnimation = mergePropsRecord(asRecord(currentOverride.animation), args.patch.values);
    const out: Record<string, unknown> = { ...currentOverride, animation: nextAnimation };
    if (isEmptyRecordValue(nextAnimation)) delete out.animation;
    return out;
  })();

  const nextResponsive: Record<string, unknown> = { ...currentResponsive };
  if (isEmptyRecordValue(nextOverride)) {
    delete nextResponsive[bp];
  } else {
    nextResponsive[bp] = nextOverride;
  }

  const { responsive: _responsive, ...restNode } = node;
  const updatedNode: DesignBlockNodeV1 = isEmptyRecordValue(nextResponsive)
    ? restNode
    : {
        ...restNode,
        responsive: nextResponsive as NonNullable<DesignBlockNodeV1["responsive"]>,
      };

  const updated = updateNodeById(document, node.id, () => updatedNode);
  if (!updated.changed) {
    return { document, inspector: buildSelectionInspectorForBreakpoint(document, blockId, bp) };
  }

  return {
    document: updated.document,
    inspector: buildSelectionInspectorForBreakpoint(updated.document, blockId, bp),
  };
}

export function buildLayerTree(document: DesignDocumentV1): EditorLayerNode[] {
  const root = document.nodesById[document.rootId];
  if (!isPageNode(root)) return [];

  const walk = (ids: DesignNodeId[]): EditorLayerNode[] =>
    ids
      .map((id) => document.nodesById[id])
      .filter((node): node is DesignBlockNodeV1 => isBlockNode(node))
      .map((node) => ({
        id: node.id,
        type: node.type,
        label: buildLayerLabel(node),
        children: Array.isArray(node.children) && node.children.length ? walk(node.children) : [],
      }));

  const pageTitle = localizedTextFromProps(root.meta?.title);
  const label = pageTitle ? `Page: ${pageTitle}` : "Page";

  return [
    {
      id: EDITOR_PAGE_ROOT_BLOCK_ID,
      type: "page",
      label,
      children: walk(root.children),
    },
  ];
}

export function insertBlock(
  document: DesignDocumentV1,
  args: EditorInsertBlockArgs,
): { document: DesignDocumentV1; selectedBlockId: string } {
  const newNode = buildDesignBlockByType(args.type);
  const newId = newNode.id;

  const withNode: DesignDocumentV1 = {
    ...document,
    nodesById: {
      ...document.nodesById,
      [newId]: newNode,
    },
  };

  const targetBlockId = args.targetBlockId ?? null;
  const position = args.position ?? "inside";

  // Default insertion target: page root.
  if (!targetBlockId || targetBlockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    const inserted = insertInsideTarget(withNode, document.rootId, [newId]);
    return { document: inserted.inserted ? inserted.document : withNode, selectedBlockId: newId };
  }

  let inserted: InsertChildrenResult;
  if (position === "inside") {
    inserted = insertInsideTarget(withNode, targetBlockId, [newId]);

    // If the target cannot have children, fall back to inserting after it.
    if (!inserted.inserted) {
      inserted = insertRelativeToTarget(withNode, targetBlockId, [newId], "after");
    }
  } else {
    inserted = insertRelativeToTarget(withNode, targetBlockId, [newId], position);
  }

  if (inserted.inserted) {
    return { document: inserted.document, selectedBlockId: newId };
  }

  // Fall back to appending to page root.
  const appended = insertInsideTarget(withNode, document.rootId, [newId]);
  return { document: appended.document, selectedBlockId: newId };
}

export function insertBlockWithMeta(
  document: DesignDocumentV1,
  args: EditorInsertBlockArgs,
): EditorInsertBlockResult & { document: DesignDocumentV1 } {
  const inserted = insertBlock(document, args);
  const inspector = buildSelectionInspector(inserted.document, inserted.selectedBlockId);
  const layers = buildLayerTree(inserted.document);

  return {
    document: inserted.document,
    blockId: inserted.selectedBlockId,
    inspector,
    layers,
  };
}

export function insertBlockTree(
  document: DesignDocumentV1,
  args: EditorInsertBlockTreeArgs,
): { document: DesignDocumentV1; selectedBlockId: string } {
  const cloned = cloneBlockTreeWithNewIds(args.blocks);

  const withNodes: DesignDocumentV1 = {
    ...document,
    nodesById: {
      ...document.nodesById,
      ...cloned.nodesById,
    },
  };

  const targetBlockId = args.targetBlockId ?? null;
  const position = args.position ?? "inside";

  if (!targetBlockId || targetBlockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    const inserted = insertInsideTarget(withNodes, document.rootId, cloned.rootIds);
    return {
      document: inserted.inserted ? inserted.document : withNodes,
      selectedBlockId: cloned.selectedBlockId,
    };
  }

  let inserted: InsertChildrenResult;
  if (position === "inside") {
    inserted = insertInsideTarget(withNodes, targetBlockId, cloned.rootIds);

    // If the target cannot have children, fall back to inserting after it.
    if (!inserted.inserted) {
      inserted = insertRelativeToTarget(withNodes, targetBlockId, cloned.rootIds, "after");
    }
  } else {
    inserted = insertRelativeToTarget(withNodes, targetBlockId, cloned.rootIds, position);
  }

  if (inserted.inserted) {
    return {
      document: inserted.document,
      selectedBlockId: cloned.selectedBlockId,
    };
  }

  const appended = insertInsideTarget(withNodes, document.rootId, cloned.rootIds);
  return {
    document: appended.document,
    selectedBlockId: cloned.selectedBlockId,
  };
}

export function insertBlockTreeWithMeta(
  document: DesignDocumentV1,
  args: EditorInsertBlockTreeArgs,
): EditorInsertBlockResult & { document: DesignDocumentV1 } {
  const inserted = insertBlockTree(document, args);
  const inspector = buildSelectionInspector(inserted.document, inserted.selectedBlockId);
  const layers = buildLayerTree(inserted.document);

  return {
    document: inserted.document,
    blockId: inserted.selectedBlockId,
    inspector,
    layers,
  };
}

export function duplicateBlock(
  document: DesignDocumentV1,
  args: { blockId: string },
): { document: DesignDocumentV1; selectedBlockId: string } {
  if (args.blockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    return { document, selectedBlockId: EDITOR_PAGE_ROOT_BLOCK_ID };
  }

  const node = document.nodesById[args.blockId];
  if (!isBlockNode(node)) {
    return { document, selectedBlockId: args.blockId };
  }

  const subtreeIds = collectSubtreeIds(document, node.id);
  const idMap = new Map<DesignNodeId, DesignNodeId>();
  for (const oldId of subtreeIds) {
    idMap.set(oldId, generateBlockId());
  }

  const nextNodes: Record<DesignNodeId, DesignNodeV1> = {};
  for (const oldId of subtreeIds) {
    const oldNode = document.nodesById[oldId];
    if (!isBlockNode(oldNode)) continue;
    const nextId = idMap.get(oldId);
    if (!nextId) continue;
    const nextChildren = Array.isArray(oldNode.children)
      ? oldNode.children.map((cid) => idMap.get(cid)).filter((x): x is string => Boolean(x))
      : undefined;

    nextNodes[nextId] = {
      id: nextId,
      type: oldNode.type,
      props: cloneJson(oldNode.props),
      ...(oldNode.responsive ? { responsive: cloneJson(oldNode.responsive) } : {}),
      ...(nextChildren ? { children: nextChildren } : {}),
    };
  }

  const cloneRootId = idMap.get(node.id);
  if (!cloneRootId) {
    return { document, selectedBlockId: args.blockId };
  }

  const withNodes: DesignDocumentV1 = {
    ...document,
    nodesById: {
      ...document.nodesById,
      ...nextNodes,
    },
  };

  // Insert clone root after the original node.
  const inserted = insertRelativeToTarget(withNodes, node.id, [cloneRootId], "after");
  if (inserted.inserted) {
    return { document: inserted.document, selectedBlockId: cloneRootId };
  }

  const appended = insertInsideTarget(withNodes, document.rootId, [cloneRootId]);
  return { document: appended.document, selectedBlockId: cloneRootId };
}

export function duplicateBlockWithMeta(
  document: DesignDocumentV1,
  args: { blockId: string },
): EditorInsertBlockResult & { document: DesignDocumentV1 } {
  const duplicated = duplicateBlock(document, args);
  const inspector = buildSelectionInspector(duplicated.document, duplicated.selectedBlockId);
  const layers = buildLayerTree(duplicated.document);

  return {
    document: duplicated.document,
    blockId: duplicated.selectedBlockId,
    inspector,
    layers,
  };
}

export function deleteBlock(
  document: DesignDocumentV1,
  args: { blockId: string },
): { document: DesignDocumentV1; deleted: boolean } {
  if (args.blockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    return { document, deleted: false };
  }

  const node = document.nodesById[args.blockId];
  if (!isBlockNode(node)) {
    return { document, deleted: false };
  }

  const parentInfo = findParentInfo(document, node.id);
  if (!parentInfo) {
    return { document, deleted: false };
  }

  const subtreeIds = collectSubtreeIds(document, node.id);

  const removedFromParent = updateChildren(document, parentInfo.parentId, (children) =>
    children.filter((id) => id !== node.id),
  );

  const nextNodesById = { ...removedFromParent.document.nodesById };
  for (const id of subtreeIds) {
    delete nextNodesById[id];
  }

  return {
    document: {
      ...removedFromParent.document,
      nodesById: nextNodesById,
    },
    deleted: true,
  };
}

export function moveBlock(
  document: DesignDocumentV1,
  args: { blockId: string; targetId: string; position: EditorInsertBlockPosition },
): { document: DesignDocumentV1; moved: boolean } {
  if (args.blockId === args.targetId) {
    return { document, moved: false };
  }

  if (args.blockId === EDITOR_PAGE_ROOT_BLOCK_ID) {
    return { document, moved: false };
  }

  const node = document.nodesById[args.blockId];
  if (!isBlockNode(node)) return { document, moved: false };

  // Do not allow moving a node inside its own subtree.
  if (containsNodeId(document, node.id, args.targetId)) {
    return { document, moved: false };
  }

  const fromParent = findParentInfo(document, node.id);
  if (!fromParent) return { document, moved: false };

  // 1) Remove from original parent.
  const removed = updateChildren(document, fromParent.parentId, (children) =>
    children.filter((id) => id !== node.id),
  );

  // 2) Insert into target.
  let inserted: InsertChildrenResult;
  if (args.position === "inside") {
    inserted = insertInsideTarget(removed.document, args.targetId, [node.id]);
    if (!inserted.inserted) {
      inserted = insertRelativeToTarget(removed.document, args.targetId, [node.id], "after");
    }
  } else {
    inserted = insertRelativeToTarget(removed.document, args.targetId, [node.id], args.position);
  }

  if (inserted.inserted) {
    return { document: inserted.document, moved: true };
  }

  // Fall back to appending to page root.
  const appended = insertInsideTarget(removed.document, document.rootId, [node.id]);
  return { document: appended.document, moved: true };
}

export type { EditorDocumentHistory };
