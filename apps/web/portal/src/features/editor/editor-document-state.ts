import type {
  EditorHistoryState,
  EditorInsertBlockArgs,
  EditorInsertBlockResult,
  EditorLayerNode,
  EditorSelectionInspector,
  EditorSelectionPatch,
} from "@celestial/site-editor-protocol";
import type { CoreBlockNode, CoreDocumentIR } from "@celestial/site-renderer-core";

type EditorDocumentHistory = {
  past: CoreDocumentIR[];
  present: CoreDocumentIR;
  future: CoreDocumentIR[];
  limit: number;
};

type UpdateBlockResult = {
  nodes: CoreBlockNode[];
  changed: boolean;
  selected: CoreBlockNode | null;
};

type InsertBlockResult = {
  nodes: CoreBlockNode[];
  inserted: boolean;
};

const HISTORY_LIMIT_DEFAULT = 100;

const COMPONENT_META_KEYS = new Set(["layout", "style", "animation"]);

function cloneDocument(doc: CoreDocumentIR): CoreDocumentIR {
  if (typeof structuredClone === "function") {
    return structuredClone(doc) as CoreDocumentIR;
  }
  return JSON.parse(JSON.stringify(doc)) as CoreDocumentIR;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return value;
}

function isContainer(node: CoreBlockNode): node is Extract<CoreBlockNode, { type: "container" }> {
  return node.type === "container";
}

function localizedTextFromProps(value: unknown): string {
  if (!isRecord(value)) return "";
  const entries = Object.values(value).filter((item): item is string => typeof item === "string");
  return entries[0] ?? "";
}

function buildLayerLabel(block: CoreBlockNode): string {
  if (block.type === "heading") {
    const text = localizedTextFromProps(block.props.text);
    return text ? `Heading: ${text}` : "Heading";
  }
  if (block.type === "paragraph") {
    const text = localizedTextFromProps(block.props.text);
    return text ? `Paragraph: ${text}` : "Paragraph";
  }
  if (block.type === "divider") return "Divider";
  return "Container";
}

function findBlock(nodes: CoreBlockNode[], blockId: string): CoreBlockNode | null {
  for (const node of nodes) {
    if (node.id === blockId) return node;
    if (isContainer(node) && Array.isArray(node.children)) {
      const found = findBlock(node.children, blockId);
      if (found) return found;
    }
  }
  return null;
}

function updateBlockById(
  nodes: CoreBlockNode[],
  blockId: string,
  updater: (node: CoreBlockNode) => CoreBlockNode,
): UpdateBlockResult {
  let changed = false;
  let selected: CoreBlockNode | null = null;

  const nextNodes = nodes.map((node) => {
    if (node.id === blockId) {
      changed = true;
      const updated = updater(node);
      selected = updated;
      return updated;
    }

    if (isContainer(node) && Array.isArray(node.children)) {
      const childResult = updateBlockById(node.children, blockId, updater);
      if (!childResult.changed) return node;
      changed = true;
      selected = childResult.selected;
      return {
        ...node,
        children: childResult.nodes,
      };
    }

    return node;
  });

  return {
    nodes: nextNodes,
    changed,
    selected,
  };
}

function withNodeProps(node: CoreBlockNode, nextProps: Record<string, unknown>): CoreBlockNode {
  if (node.type === "container") {
    if (Array.isArray(node.children)) {
      return {
        id: node.id,
        type: node.type,
        props: nextProps as typeof node.props,
        children: node.children,
      };
    }
    return {
      id: node.id,
      type: node.type,
      props: nextProps as typeof node.props,
    };
  }

  if (node.type === "heading") {
    return {
      id: node.id,
      type: node.type,
      props: nextProps as unknown as typeof node.props,
    };
  }

  if (node.type === "paragraph") {
    return {
      id: node.id,
      type: node.type,
      props: nextProps as unknown as typeof node.props,
    };
  }

  return {
    id: node.id,
    type: node.type,
    props: nextProps as unknown as typeof node.props,
  };
}

function insertRelativeToTarget(
  nodes: CoreBlockNode[],
  targetBlockId: string,
  newBlock: CoreBlockNode,
  position: "before" | "after",
): InsertBlockResult {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;
    if (node.id === targetBlockId) {
      const next = [...nodes];
      const at = position === "before" ? index : index + 1;
      next.splice(at, 0, newBlock);
      return { nodes: next, inserted: true };
    }

    if (isContainer(node) && Array.isArray(node.children)) {
      const child = insertRelativeToTarget(node.children, targetBlockId, newBlock, position);
      if (!child.inserted) continue;
      const next = [...nodes];
      next[index] = { ...node, children: child.nodes };
      return { nodes: next, inserted: true };
    }
  }

  return { nodes, inserted: false };
}

function insertInsideTarget(
  nodes: CoreBlockNode[],
  targetBlockId: string,
  newBlock: CoreBlockNode,
): InsertBlockResult {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;

    if (node.id === targetBlockId && isContainer(node)) {
      const children = Array.isArray(node.children) ? node.children : [];
      const next = [...nodes];
      next[index] = {
        ...node,
        children: [...children, newBlock],
      };
      return { nodes: next, inserted: true };
    }

    if (isContainer(node) && Array.isArray(node.children)) {
      const child = insertInsideTarget(node.children, targetBlockId, newBlock);
      if (!child.inserted) continue;
      const next = [...nodes];
      next[index] = { ...node, children: child.nodes };
      return { nodes: next, inserted: true };
    }
  }

  return { nodes, inserted: false };
}

function buildCoreBlockByType(type: EditorInsertBlockArgs["type"]): CoreBlockNode {
  const id = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (type === "container") {
    return {
      id,
      type,
      props: {
        as: "section",
      },
      children: [],
    };
  }

  if (type === "heading") {
    return {
      id,
      type,
      props: {
        level: 2,
        text: {
          "en-US": "Heading",
          "zh-CN": "标题",
        },
      },
    };
  }

  if (type === "paragraph") {
    return {
      id,
      type,
      props: {
        text: {
          "en-US": "Paragraph",
          "zh-CN": "段落",
        },
      },
    };
  }

  return {
    id,
    type,
    props: {
      variant: "default",
    },
  };
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

export function createEditorHistory(initialDocument: CoreDocumentIR, limit = HISTORY_LIMIT_DEFAULT): EditorDocumentHistory {
  return {
    past: [],
    present: cloneDocument(initialDocument),
    future: [],
    limit,
  };
}

export function commitEditorHistory(state: EditorDocumentHistory, nextDocument: CoreDocumentIR): EditorDocumentHistory {
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
  document: CoreDocumentIR,
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

  const block = findBlock(document.blocks, blockId);
  if (!block) {
    return {
      blockId: null,
      blockType: null,
      component: {},
      layout: {},
      design: {},
      animation: {},
    };
  }

  const props = asRecord(block.props);
  return {
    blockId: block.id,
    blockType: block.type,
    component: componentSectionFromProps(props),
    layout: asRecord(props.layout),
    design: asRecord(props.style),
    animation: asRecord(props.animation),
  };
}

export function applySelectionPatch(
  document: CoreDocumentIR,
  blockId: string | null,
  patch: EditorSelectionPatch,
): { document: CoreDocumentIR; inspector: EditorSelectionInspector } {
  if (!blockId) {
    return {
      document,
      inspector: buildSelectionInspector(document, null),
    };
  }

  const updateResult = updateBlockById(document.blocks, blockId, (node) => {
    const currentProps = asRecord(node.props);

    if (patch.section === "component") {
      const nextComponent = mergePropsRecord(componentSectionFromProps(currentProps), patch.values);
      const merged: Record<string, unknown> = {
        ...nextComponent,
      };
      if (currentProps.layout !== undefined) merged.layout = currentProps.layout;
      if (currentProps.style !== undefined) merged.style = currentProps.style;
      if (currentProps.animation !== undefined) merged.animation = currentProps.animation;
      return withNodeProps(node, merged);
    }

    if (patch.section === "layout") {
      return withNodeProps(node, mergeNestedProps(currentProps, "layout", patch.values));
    }

    if (patch.section === "design") {
      return withNodeProps(node, mergeNestedProps(currentProps, "style", patch.values));
    }

    return withNodeProps(node, mergeNestedProps(currentProps, "animation", patch.values));
  });

  if (!updateResult.changed) {
    return {
      document,
      inspector: buildSelectionInspector(document, blockId),
    };
  }

  const nextDocument = {
    ...document,
    blocks: updateResult.nodes,
  };

  return {
    document: nextDocument,
    inspector: buildSelectionInspector(nextDocument, blockId),
  };
}

export function buildLayerTree(document: CoreDocumentIR): EditorLayerNode[] {
  const walk = (nodes: CoreBlockNode[]): EditorLayerNode[] =>
    nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: buildLayerLabel(node),
      children: isContainer(node) && Array.isArray(node.children) ? walk(node.children) : [],
    }));

  return walk(document.blocks);
}

export function insertBlock(
  document: CoreDocumentIR,
  args: EditorInsertBlockArgs,
): { document: CoreDocumentIR; selectedBlockId: string } {
  const block = buildCoreBlockByType(args.type);

  const targetBlockId = args.targetBlockId ?? null;
  const position = args.position ?? "inside";

  if (!targetBlockId) {
    return {
      document: {
        ...document,
        blocks: [...document.blocks, block],
      },
      selectedBlockId: block.id,
    };
  }

  let inserted: InsertBlockResult;
  if (position === "inside") {
    inserted = insertInsideTarget(document.blocks, targetBlockId, block);
  } else {
    inserted = insertRelativeToTarget(document.blocks, targetBlockId, block, position);
  }

  if (inserted.inserted) {
    return {
      document: {
        ...document,
        blocks: inserted.nodes,
      },
      selectedBlockId: block.id,
    };
  }

  return {
    document: {
      ...document,
      blocks: [...document.blocks, block],
    },
    selectedBlockId: block.id,
  };
}

export function insertBlockWithMeta(
  document: CoreDocumentIR,
  args: EditorInsertBlockArgs,
): EditorInsertBlockResult & { document: CoreDocumentIR } {
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

export type { EditorDocumentHistory };
