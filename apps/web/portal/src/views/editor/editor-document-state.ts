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

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return value;
}

type ParentBlockNode = Extract<CoreBlockNode, { type: "container" | "grid" }>;

function isParentBlockNode(node: CoreBlockNode): node is ParentBlockNode {
  return node.type === "container" || node.type === "grid";
}

function getChildNodes(node: CoreBlockNode): CoreBlockNode[] | null {
  if (!isParentBlockNode(node)) return null;
  if (!Array.isArray(node.children)) return null;
  return node.children;
}

function ensureChildren(node: ParentBlockNode): CoreBlockNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

function localizedTextFromProps(value: unknown): string {
  if (!isRecord(value)) return "";
  return Object.values(value).find((item): item is string => typeof item === "string") ?? "";
}

function buildLayerLabel(block: CoreBlockNode): string {
  switch (block.type) {
    case "heading": {
      const text = localizedTextFromProps(block.props.text);
      return text ? `Heading: ${text}` : "Heading";
    }
    case "paragraph": {
      const text = localizedTextFromProps(block.props.text);
      return text ? `Paragraph: ${text}` : "Paragraph";
    }
    case "button": {
      const text = localizedTextFromProps(block.props.text);
      return text ? `Button: ${text}` : "Button";
    }
    case "quote": {
      const text = localizedTextFromProps(block.props.text);
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
      const name = block.props.name;
      return name.trim() ? `Icon: ${name}` : "Icon";
    }
  }
}

function findBlock(nodes: CoreBlockNode[], blockId: string): CoreBlockNode | null {
  for (const node of nodes) {
    if (node.id === blockId) return node;
    const children = getChildNodes(node);
    if (children) {
      const found = findBlock(children, blockId);
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

    if (isParentBlockNode(node) && Array.isArray(node.children)) {
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
  // Keep children untouched (if present); only update props.
  return { ...node, props: nextProps as unknown as typeof node.props } as CoreBlockNode;
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

    if (isParentBlockNode(node) && Array.isArray(node.children)) {
      const child = insertRelativeToTarget(node.children, targetBlockId, newBlock, position);
      if (!child.inserted) continue;
      const next = [...nodes];
      next[index] = { ...node, children: child.nodes };
      return { nodes: next, inserted: true };
    }
  }

  return { nodes, inserted: false };
}

function insertManyRelativeToTarget(
  nodes: CoreBlockNode[],
  targetBlockId: string,
  newBlocks: CoreBlockNode[],
  position: "before" | "after",
): InsertBlockResult {
  if (newBlocks.length === 0) return { nodes, inserted: false };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;
    if (node.id === targetBlockId) {
      const next = [...nodes];
      const at = position === "before" ? index : index + 1;
      next.splice(at, 0, ...newBlocks);
      return { nodes: next, inserted: true };
    }

    if (isParentBlockNode(node) && Array.isArray(node.children)) {
      const child = insertManyRelativeToTarget(node.children, targetBlockId, newBlocks, position);
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

    if (node.id === targetBlockId && isParentBlockNode(node)) {
      const children = ensureChildren(node);
      const next = [...nodes];
      next[index] = {
        ...node,
        children: [...children, newBlock],
      };
      return { nodes: next, inserted: true };
    }

    if (isParentBlockNode(node) && Array.isArray(node.children)) {
      const child = insertInsideTarget(node.children, targetBlockId, newBlock);
      if (!child.inserted) continue;
      const next = [...nodes];
      next[index] = { ...node, children: child.nodes };
      return { nodes: next, inserted: true };
    }
  }

  return { nodes, inserted: false };
}

function insertManyInsideTarget(
  nodes: CoreBlockNode[],
  targetBlockId: string,
  newBlocks: CoreBlockNode[],
): InsertBlockResult {
  if (newBlocks.length === 0) return { nodes, inserted: false };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;

    if (node.id === targetBlockId && isParentBlockNode(node)) {
      const children = ensureChildren(node);
      const next = [...nodes];
      next[index] = {
        ...node,
        children: [...children, ...newBlocks],
      };
      return { nodes: next, inserted: true };
    }

    if (isParentBlockNode(node) && Array.isArray(node.children)) {
      const child = insertManyInsideTarget(node.children, targetBlockId, newBlocks);
      if (!child.inserted) continue;
      const next = [...nodes];
      next[index] = { ...node, children: child.nodes };
      return { nodes: next, inserted: true };
    }
  }

  return { nodes, inserted: false };
}

function generateBlockId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type BlockTreeCloneResult = {
  blocks: CoreBlockNode[];
  selectedBlockId: string;
};

function cloneBlockTreeWithNewIds(blocks: CoreBlockNode[]): BlockTreeCloneResult {
  const cloneNode = (node: CoreBlockNode): CoreBlockNode => {
    const base = cloneJson(node);
    const nextId = generateBlockId();

    if (isParentBlockNode(base) && Array.isArray(base.children)) {
      return {
        ...base,
        id: nextId,
        children: base.children.map(cloneNode),
      };
    }

    return {
      ...base,
      id: nextId,
    };
  };

  if (blocks.length === 0) {
    throw new Error("insertBlockTree requires non-empty blocks");
  }

  const nextBlocks = blocks.map(cloneNode);
  const selectedBlockId = nextBlocks[0]?.id;
  if (!selectedBlockId) {
    throw new Error("insertBlockTree failed to generate a selected block id");
  }

  return { blocks: nextBlocks, selectedBlockId };
}

function localized(en: string, zh: string): Record<string, string> {
  return { "en-US": en, "zh-CN": zh };
}

function buildCoreBlockByType(type: EditorInsertBlockArgs["type"]): CoreBlockNode {
  const id = generateBlockId();

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
    } as CoreBlockNode;
  }

  if (type === "spacer") {
    return {
      id,
      type,
      props: {
        height: "24px",
      },
    } as CoreBlockNode;
  }

  if (type === "divider") {
    return {
      id,
      type,
      props: {
        variant: "default",
      },
    } as CoreBlockNode;
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
    } as CoreBlockNode;
  }

  if (type === "quote") {
    return {
      id,
      type,
      props: {
        text: localized("Quote", "引用"),
        citation: localized("Source", "来源"),
      },
    } as CoreBlockNode;
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
    } as CoreBlockNode;
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
    } as CoreBlockNode;
  }

  if (type === "icon") {
    return {
      id,
      type,
      props: {
        name: "star",
        size: "24px",
      },
    } as CoreBlockNode;
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
    } as CoreBlockNode;
  }

  return {
    id,
    type,
    props: {
      // Keep unknown blocks minimally renderable.
    },
  } as CoreBlockNode;
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

export function createEditorHistory(
  initialDocument: CoreDocumentIR,
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
  nextDocument: CoreDocumentIR,
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
      children: getChildNodes(node) ? walk(getChildNodes(node) ?? []) : [],
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

export function insertBlockTree(
  document: CoreDocumentIR,
  args: EditorInsertBlockTreeArgs,
): { document: CoreDocumentIR; selectedBlockId: string } {
  const inputBlocks = args.blocks as unknown as CoreBlockNode[];
  const cloned = cloneBlockTreeWithNewIds(inputBlocks);

  const targetBlockId = args.targetBlockId ?? null;
  const position = args.position ?? "inside";

  if (!targetBlockId) {
    return {
      document: {
        ...document,
        blocks: [...document.blocks, ...cloned.blocks],
      },
      selectedBlockId: cloned.selectedBlockId,
    };
  }

  let inserted: InsertBlockResult;
  if (position === "inside") {
    inserted = insertManyInsideTarget(document.blocks, targetBlockId, cloned.blocks);

    // If the target cannot have children, fall back to inserting after it.
    if (!inserted.inserted) {
      inserted = insertManyRelativeToTarget(document.blocks, targetBlockId, cloned.blocks, "after");
    }
  } else {
    inserted = insertManyRelativeToTarget(document.blocks, targetBlockId, cloned.blocks, position);
  }

  if (!inserted.inserted) {
    return {
      document: {
        ...document,
        blocks: [...document.blocks, ...cloned.blocks],
      },
      selectedBlockId: cloned.selectedBlockId,
    };
  }

  return {
    document: {
      ...document,
      blocks: inserted.nodes,
    },
    selectedBlockId: cloned.selectedBlockId,
  };
}

export function insertBlockTreeWithMeta(
  document: CoreDocumentIR,
  args: EditorInsertBlockTreeArgs,
): EditorInsertBlockResult & { document: CoreDocumentIR } {
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

type ExtractBlockResult = {
  nodes: CoreBlockNode[];
  extracted: CoreBlockNode | null;
  extractedParentId: string | null;
};

function extractBlockById(
  nodes: CoreBlockNode[],
  blockId: string,
  parentId: string | null = null,
): ExtractBlockResult {
  const next: CoreBlockNode[] = [];
  let extracted: CoreBlockNode | null = null;
  let extractedParentId: string | null = null;

  for (const node of nodes) {
    if (!node) continue;
    if (node.id === blockId) {
      extracted = node;
      extractedParentId = parentId;
      continue;
    }

    if (isParentBlockNode(node) && Array.isArray(node.children)) {
      const child = extractBlockById(node.children, blockId, node.id);
      if (child.extracted) {
        extracted = child.extracted;
        extractedParentId = child.extractedParentId;
        next.push({ ...node, children: child.nodes });
        continue;
      }
    }

    next.push(node);
  }

  return { nodes: next, extracted, extractedParentId };
}

function containsBlockId(node: CoreBlockNode, candidateId: string): boolean {
  if (node.id === candidateId) return true;
  const children = getChildNodes(node);
  if (!children) return false;
  return children.some((child) => containsBlockId(child, candidateId));
}

export function duplicateBlock(
  document: CoreDocumentIR,
  args: { blockId: string },
): { document: CoreDocumentIR; selectedBlockId: string } {
  const existing = findBlock(document.blocks, args.blockId);
  if (!existing) {
    return { document, selectedBlockId: args.blockId };
  }

  const cloned = cloneBlockTreeWithNewIds([existing]);
  const cloneRoot = cloned.blocks[0];
  if (!cloneRoot) {
    return { document, selectedBlockId: args.blockId };
  }

  const inserted = insertManyRelativeToTarget(document.blocks, args.blockId, [cloneRoot], "after");
  if (!inserted.inserted) {
    return {
      document: {
        ...document,
        blocks: [...document.blocks, cloneRoot],
      },
      selectedBlockId: cloneRoot.id,
    };
  }

  return {
    document: {
      ...document,
      blocks: inserted.nodes,
    },
    selectedBlockId: cloneRoot.id,
  };
}

export function duplicateBlockWithMeta(
  document: CoreDocumentIR,
  args: { blockId: string },
): EditorInsertBlockResult & { document: CoreDocumentIR } {
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
  document: CoreDocumentIR,
  args: { blockId: string },
): { document: CoreDocumentIR; deleted: boolean } {
  const extracted = extractBlockById(document.blocks, args.blockId);
  if (!extracted.extracted) {
    return { document, deleted: false };
  }

  return {
    document: {
      ...document,
      blocks: extracted.nodes,
    },
    deleted: true,
  };
}

export function moveBlock(
  document: CoreDocumentIR,
  args: { blockId: string; targetId: string; position: EditorInsertBlockPosition },
): { document: CoreDocumentIR; moved: boolean } {
  if (args.blockId === args.targetId) {
    return { document, moved: false };
  }

  const extracted = extractBlockById(document.blocks, args.blockId);
  if (!extracted.extracted) {
    return { document, moved: false };
  }

  // Do not allow moving a node inside its own subtree.
  if (containsBlockId(extracted.extracted, args.targetId)) {
    return { document, moved: false };
  }

  let inserted: InsertBlockResult;
  if (args.position === "inside") {
    inserted = insertInsideTarget(extracted.nodes, args.targetId, extracted.extracted);
    if (!inserted.inserted) {
      inserted = insertRelativeToTarget(
        extracted.nodes,
        args.targetId,
        extracted.extracted,
        "after",
      );
    }
  } else {
    inserted = insertRelativeToTarget(
      extracted.nodes,
      args.targetId,
      extracted.extracted,
      args.position,
    );
  }

  const nextBlocks = inserted.inserted ? inserted.nodes : [...extracted.nodes, extracted.extracted];

  return {
    document: {
      ...document,
      blocks: nextBlocks,
    },
    moved: true,
  };
}

export type { EditorDocumentHistory };
