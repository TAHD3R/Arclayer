import { describe, expect, test } from "vitest";

import { EDITOR_PAGE_ROOT_BLOCK_ID } from "@celestial/site-editor-protocol";
import type { DesignDocumentV1 } from "@celestial/site-block-protocol";

import {
  applySelectionPatch,
  buildLayerTree,
  buildSelectionInspector,
  buildSelectionInspectorForBreakpoint,
  commitEditorHistory,
  createEditorHistory,
  deleteBlock,
  moveBlock,
  redoEditorHistory,
  duplicateBlockWithMeta,
  insertBlockTreeWithMeta,
  insertBlockWithMeta,
  setBreakpointOverride,
  undoEditorHistory,
} from "@/views/editor/editor-document-state";

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getChildren(doc: DesignDocumentV1, nodeId: string): string[] {
  const node = doc.nodesById[nodeId] as unknown as { children?: unknown };
  const children = node.children;
  if (!Array.isArray(children)) return [];
  return children.filter((x): x is string => typeof x === "string");
}

function getLayoutSelfRectWidth(inspector: { layout: unknown }): number | undefined {
  const layout = asRecord(inspector.layout);
  const self = layout ? asRecord(layout.self) : null;
  const rect = self ? asRecord(self.rect) : null;
  const width = rect?.width;
  return typeof width === "number" ? width : undefined;
}

function getResponsiveOverrideWidth(
  doc: DesignDocumentV1,
  nodeId: string,
  breakpoint: string,
): number | undefined {
  const node = doc.nodesById[nodeId] as unknown as { responsive?: unknown };
  const responsive = asRecord(node.responsive);
  const bp = responsive ? asRecord(responsive[breakpoint]) : null;
  const layout = bp ? asRecord(bp.layout) : null;
  const self = layout ? asRecord(layout.self) : null;
  const rect = self ? asRecord(self.rect) : null;
  const width = rect?.width;
  return typeof width === "number" ? width : undefined;
}

function createSampleDesignDocument(): DesignDocumentV1 {
  return {
    version: 1,
    rootId: EDITOR_PAGE_ROOT_BLOCK_ID,
    nodesById: {
      [EDITOR_PAGE_ROOT_BLOCK_ID]: {
        id: EDITOR_PAGE_ROOT_BLOCK_ID,
        type: "page_root",
        name: "Page",
        children: ["c-root"],
        seo: {
          title: { "en-US": "Untitled", "zh-CN": "未命名" },
        },
        layout: { children: { mode: "absolute" } },
      },
      "c-root": {
        id: "c-root",
        type: "frame",
        name: "RootFrame",
        children: ["h-title", "p-body"],
        layout: {
          self: {
            rect: { x: 0, y: 0, width: 800, height: 600 },
            constraints: { horizontal: "leftRight", vertical: "topBottom" },
            alignX: "start",
            alignY: "start",
          },
          children: { mode: "absolute" },
        },
        style: { backgroundColor: "#ffffff" },
      },
      "h-title": {
        id: "h-title",
        type: "text",
        name: "Title",
        text: { "en-US": "Hello", "zh-CN": "你好" },
        tag: "h1",
        align: "left",
        motionRefs: [{ motionId: "motion_1" }],
        layout: {
          self: {
            rect: { x: 24, y: 24, width: 240, height: 40 },
            constraints: { horizontal: "left", vertical: "top" },
            alignX: "start",
            alignY: "start",
          },
          children: { mode: "absolute" },
        },
        style: { typography: { fontSize: 32, lineHeight: 40, fontWeight: 600 } },
      },
      "p-body": {
        id: "p-body",
        type: "text",
        name: "Body",
        text: { "en-US": "Paragraph", "zh-CN": "段落" },
        tag: "p",
        layout: {
          self: {
            rect: { x: 24, y: 80, width: 320, height: 48 },
            constraints: { horizontal: "left", vertical: "top" },
            alignX: "start",
            alignY: "start",
          },
          children: { mode: "absolute" },
        },
      },
    },
  };
}

describe("editor document state", () => {
  test("buildSelectionInspector extracts block sections", () => {
    const doc = createSampleDesignDocument();

    const inspector = buildSelectionInspector(doc, "h-title");

    expect(inspector.blockId).toBe("h-title");
    expect(inspector.blockType).toBe("text");
    expect(inspector.component).toMatchObject({ tag: "h1", align: "left" });
    expect(inspector.animation).toMatchObject({ motionRefs: [{ motionId: "motion_1" }] });
  });

  test("applySelectionPatch updates component and layout fields", () => {
    const doc = createSampleDesignDocument();

    const first = applySelectionPatch({
      document: doc,
      blockId: "h-title",
      patch: { section: "component", values: { tag: "h2" } },
    });

    const second = applySelectionPatch({
      document: first.document,
      blockId: "h-title",
      patch: { section: "layout", values: { self: { rect: { width: 640 } } } },
    });

    const heading = second.inspector;
    expect(heading.component.tag).toBe("h2");
    expect(getLayoutSelfRectWidth(heading)).toBe(640);
  });

  test("prefab nodes: inspector uses prefab:<code> blockType and patches nested props + style whitelist", () => {
    const doc = createSampleDesignDocument();

    const inserted = insertBlockWithMeta({
      document: doc,
      insert: { type: "prefab:card", targetBlockId: "c-root", position: "inside" },
    });

    const prefabId = inserted.selectedId;
    const inspector = buildSelectionInspector(inserted.document, prefabId || null);
    expect(inspector.blockType).toBe("prefab:card");
    expect(inspector.component).toHaveProperty("props");

    const patchedComponent = applySelectionPatch({
      document: inserted.document,
      blockId: prefabId,
      patch: {
        section: "component",
        values: {
          props: {
            title: { "en-US": "My Card", "zh-CN": "我的卡片" },
          },
        },
      },
    });
    const component = asRecord(patchedComponent.inspector.component);
    const props = component ? asRecord(component.props) : null;
    const title = props?.title;
    expect(title).toMatchObject({
      kind: "literal",
      value: { "en-US": "My Card", "zh-CN": "我的卡片" },
    });

    const patchedDesign = applySelectionPatch({
      document: patchedComponent.document,
      blockId: prefabId,
      patch: {
        section: "design",
        values: {
          color: "#ff0000", // not in whitelist
          backgroundColor: "#111111",
        },
      },
    });
    expect(patchedDesign.inspector.design).not.toHaveProperty("color");
    expect(patchedDesign.inspector.design.backgroundColor).toBe("#111111");
  });

  test("insertBlock appends into selected container", () => {
    const doc = createSampleDesignDocument();

    const inserted = insertBlockWithMeta({
      document: doc,
      insert: { type: "text", targetBlockId: "c-root", position: "inside" },
    });

    const tree = buildLayerTree(inserted.document);
    const page = tree[0];
    expect(page).toBeDefined();
    if (!page) return;
    expect(page.id).toBe(EDITOR_PAGE_ROOT_BLOCK_ID);

    const root = page.children[0];
    expect(root).toBeDefined();
    if (!root) return;
    expect(root.id).toBe("c-root");
    expect(inserted.selectedId).toMatch(/^n/);

    const ids = getChildren(inserted.document, "c-root");
    expect(ids).toEqual(["h-title", "p-body", inserted.selectedId]);
  });

  test("history supports commit undo redo", () => {
    const doc = createSampleDesignDocument();
    const history = createEditorHistory({ initialDocument: doc, limit: 10 });

    const patched = applySelectionPatch({
      document: doc,
      blockId: "h-title",
      patch: { section: "component", values: { tag: "h3" } },
    }).document;

    const committed = commitEditorHistory(history, patched);
    expect(committed.past).toHaveLength(1);
    expect(committed.future).toHaveLength(0);

    const undone = undoEditorHistory(committed);
    expect(undone.future).toHaveLength(1);
    expect(buildSelectionInspector(undone.present, "h-title").component.tag).toBe("h1");

    const redone = redoEditorHistory(undone);
    expect(redone.past).toHaveLength(1);
    expect(buildSelectionInspector(redone.present, "h-title").component.tag).toBe("h3");
  });

  test("insertBlockTree rewrites ids and inserts multiple blocks inside container", () => {
    const doc = createSampleDesignDocument();

    const inserted = insertBlockTreeWithMeta({
      document: doc,
      insert: {
        blocks: [
          {
            id: "temp-container",
            type: "container",
            props: { as: "section" },
            children: [
              {
                id: "temp-heading",
                type: "heading",
                props: {
                  level: 2,
                  text: { "en-US": "Inserted", "zh-CN": "插入" },
                  align: "left",
                },
              },
            ],
          },
        ],
        targetBlockId: "c-root",
        position: "inside",
      },
    });

    expect(inserted.selectedId).not.toBe("temp-container");
    expect(inserted.selectedId).not.toBe("temp-heading");

    expect(getChildren(inserted.document, "c-root").length).toBe(3);

    const tree = buildLayerTree(inserted.document);
    expect(JSON.stringify(tree)).not.toContain("temp-container");
    expect(JSON.stringify(tree)).not.toContain("temp-heading");
  });

  test("duplicateBlock clones subtree and inserts after original", () => {
    const doc = createSampleDesignDocument();

    const duplicated = duplicateBlockWithMeta({ document: doc, blockId: "h-title" });

    expect(duplicated.selectedId).not.toBe("h-title");
    const ids = getChildren(duplicated.document, "c-root");
    expect(ids).toEqual(["h-title", duplicated.selectedId, "p-body"]);
  });

  test("deleteBlock removes node and its subtree", () => {
    const doc = createSampleDesignDocument();

    const deleted = deleteBlock({ document: doc, blockId: "h-title" });

    const ids = getChildren(deleted.document, "c-root");
    expect(ids).toEqual(["p-body"]);
    expect(deleted.document.nodesById["h-title"]).toBeUndefined();
  });

  test("moveBlock reorders nodes within same parent", () => {
    const doc = createSampleDesignDocument();

    const moved = moveBlock({
      document: doc,
      blockId: "p-body",
      targetId: "h-title",
      position: "before",
    });

    const ids = getChildren(moved.document, "c-root");
    expect(ids).toEqual(["p-body", "h-title"]);
  });

  test("page root inspector/patch updates DesignDocument seo", () => {
    const doc = createSampleDesignDocument();

    const rootInspector = buildSelectionInspector(doc, EDITOR_PAGE_ROOT_BLOCK_ID);
    expect(rootInspector.blockId).toBe(EDITOR_PAGE_ROOT_BLOCK_ID);
    expect(rootInspector.blockType).toBe("page");

    const patched = applySelectionPatch({
      document: doc,
      blockId: EDITOR_PAGE_ROOT_BLOCK_ID,
      patch: { section: "component", values: { title: { "en-US": "Home", "zh-CN": "主页" } } },
    });

    const page = patched.document.nodesById[EDITOR_PAGE_ROOT_BLOCK_ID] as unknown as {
      seo?: { title?: Record<string, string> };
    };
    expect(page.seo?.title?.["en-US"]).toBe("Home");
    expect(page.seo?.title?.["zh-CN"]).toBe("主页");
  });

  test("setBreakpointOverride writes node.responsive and merges inspector", () => {
    const doc = createSampleDesignDocument();

    const first = setBreakpointOverride({
      document: doc,
      blockId: "h-title",
      breakpoint: "mobile",
      patch: { section: "layout", values: { self: { rect: { width: 320 } } } },
    });

    expect(getResponsiveOverrideWidth(first.document, "h-title", "mobile")).toBe(320);

    const merged = buildSelectionInspectorForBreakpoint({
      document: first.document,
      blockId: "h-title",
      breakpoint: "mobile",
    });
    expect(getLayoutSelfRectWidth(merged)).toBe(320);

    const cleared = setBreakpointOverride({
      document: first.document,
      blockId: "h-title",
      breakpoint: "mobile",
      patch: { section: "layout", values: { self: { rect: { width: null } } } },
    });

    const clearedNode = cleared.document.nodesById["h-title"] as unknown as {
      responsive?: unknown;
    };
    expect(clearedNode.responsive).toBeUndefined();
  });
});
