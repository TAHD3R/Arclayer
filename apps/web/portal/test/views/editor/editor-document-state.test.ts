import { describe, expect, test } from "vitest";

import {
  compileDesignDocumentV1ToDocumentIR,
  isCoreDocumentIR,
  isDocumentIR,
  migrateDocumentIRToDesignDocumentV1,
} from "@celestial/site-renderer-core";
import type { CoreDocumentIR, DocumentIR } from "@celestial/site-renderer-core";
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
  insertBlock,
  insertBlockTree,
  moveBlock,
  redoEditorHistory,
  duplicateBlock,
  setBreakpointOverride,
  undoEditorHistory,
} from "@/views/editor/editor-document-state";

function createSampleDocumentIR(): CoreDocumentIR {
  return {
    version: 1,
    blocks: [
      {
        id: "c-root",
        type: "container",
        props: {
          as: "section",
          layout: { width: "100%", padding: 24 },
          style: { backgroundColor: "#ffffff" },
        },
        children: [
          {
            id: "h-title",
            type: "heading",
            props: {
              level: 1,
              text: {
                "en-US": "Hello",
                "zh-CN": "你好",
              },
              align: "left",
              animation: { type: "fade", durationMs: 220 },
            },
          },
          {
            id: "p-body",
            type: "paragraph",
            props: {
              text: {
                "en-US": "Paragraph",
              },
            },
          },
        ],
      },
    ],
  };
}

function createSampleDesignDocument(): DesignDocumentV1 {
  return migrateDocumentIRToDesignDocumentV1(createSampleDocumentIR());
}

function compile(doc: DesignDocumentV1): CoreDocumentIR {
  const compiled = compileDesignDocumentV1ToDocumentIR(doc);
  if (!isCoreDocumentIR(compiled)) {
    throw new Error("Expected compiled document to be CoreDocumentIR");
  }
  return compiled;
}

function compileAny(doc: DesignDocumentV1): DocumentIR {
  const compiled = compileDesignDocumentV1ToDocumentIR(doc);
  if (!isDocumentIR(compiled)) {
    throw new Error("Expected compiled document to be DocumentIR");
  }
  return compiled;
}

describe("editor document state", () => {
  test("buildSelectionInspector extracts block sections", () => {
    const doc = createSampleDesignDocument();

    const inspector = buildSelectionInspector(doc, "h-title");

    expect(inspector.blockId).toBe("h-title");
    expect(inspector.blockType).toBe("heading");
    expect(inspector.component).toMatchObject({ level: 1, align: "left" });
    expect(inspector.animation).toMatchObject({ type: "fade", durationMs: 220 });
  });

  test("applySelectionPatch updates component and layout fields", () => {
    const doc = createSampleDesignDocument();

    const first = applySelectionPatch(doc, "h-title", {
      section: "component",
      values: {
        level: 2,
      },
    });

    const second = applySelectionPatch(first.document, "h-title", {
      section: "layout",
      values: {
        width: 640,
      },
    });

    const heading = second.inspector;
    expect(heading.component.level).toBe(2);
    expect(heading.layout.width).toBe(640);
  });

  test("prefab nodes: inspector uses prefab:<code> blockType and patches nested props + style whitelist", () => {
    const doc = createSampleDesignDocument();

    const inserted = insertBlock(doc, {
      type: "prefab:card",
      targetBlockId: "c-root",
      position: "inside",
    });

    const prefabId = inserted.selectedBlockId;
    const inspector = buildSelectionInspector(inserted.document, prefabId);
    expect(inspector.blockType).toBe("prefab:card");
    expect(inspector.component).toHaveProperty("title");

    const patchedComponent = applySelectionPatch(inserted.document, prefabId, {
      section: "component",
      values: {
        title: { "en-US": "My Card", "zh-CN": "我的卡片" },
      },
    });
    expect(patchedComponent.inspector.component).toMatchObject({
      title: { "en-US": "My Card", "zh-CN": "我的卡片" },
    });

    const patchedDesign = applySelectionPatch(patchedComponent.document, prefabId, {
      section: "design",
      values: {
        color: "#ff0000", // not in whitelist
        backgroundColor: "#111111",
      },
    });
    expect(patchedDesign.inspector.design).not.toHaveProperty("color");
    expect(patchedDesign.inspector.design.backgroundColor).toBe("#111111");

    const compiled = compileAny(patchedDesign.document);
    expect(JSON.stringify(compiled)).toContain('"__prefab__"');
  });

  test("insertBlock appends into selected container", () => {
    const doc = createSampleDesignDocument();

    const inserted = insertBlock(doc, {
      type: "heading",
      targetBlockId: "c-root",
      position: "inside",
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
    expect(inserted.selectedBlockId).toMatch(/^b-/);

    const compiled = compile(inserted.document);
    const container = compiled.blocks[0] as unknown as { children?: Array<{ id: string }> };
    const ids = (container.children ?? []).map((n) => n.id);
    expect(ids).toEqual(["h-title", "p-body", inserted.selectedBlockId]);
  });

  test("history supports commit undo redo", () => {
    const doc = createSampleDesignDocument();
    const history = createEditorHistory(doc, 10);

    const patched = applySelectionPatch(doc, "h-title", {
      section: "component",
      values: { level: 3 },
    }).document;

    const committed = commitEditorHistory(history, patched);
    expect(committed.past).toHaveLength(1);
    expect(committed.future).toHaveLength(0);

    const undone = undoEditorHistory(committed);
    expect(undone.future).toHaveLength(1);
    expect(buildSelectionInspector(undone.present, "h-title").component.level).toBe(1);

    const redone = redoEditorHistory(undone);
    expect(redone.past).toHaveLength(1);
    expect(buildSelectionInspector(redone.present, "h-title").component.level).toBe(3);
  });

  test("insertBlockTree rewrites ids and inserts multiple blocks inside container", () => {
    const doc = createSampleDesignDocument();

    const inserted = insertBlockTree(doc, {
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
    });

    expect(inserted.selectedBlockId).not.toBe("temp-container");
    expect(inserted.selectedBlockId).not.toBe("temp-heading");

    const compiled = compile(inserted.document);
    const container = compiled.blocks[0] as unknown as { children?: Array<{ id: string }> };
    expect((container.children ?? []).length).toBe(3);

    const tree = buildLayerTree(inserted.document);
    expect(JSON.stringify(tree)).not.toContain("temp-container");
    expect(JSON.stringify(tree)).not.toContain("temp-heading");
  });

  test("duplicateBlock clones subtree and inserts after original", () => {
    const doc = createSampleDesignDocument();

    const duplicated = duplicateBlock(doc, { blockId: "h-title" });

    expect(duplicated.selectedBlockId).not.toBe("h-title");
    const compiled = compile(duplicated.document);
    const container = compiled.blocks[0] as unknown as { children?: Array<{ id: string }> };
    const ids = (container.children ?? []).map((n) => n.id);
    expect(ids).toEqual(["h-title", duplicated.selectedBlockId, "p-body"]);
  });

  test("deleteBlock removes node and its subtree", () => {
    const doc = createSampleDesignDocument();

    const deleted = deleteBlock(doc, { blockId: "h-title" });
    expect(deleted.deleted).toBe(true);

    const compiled = compile(deleted.document);
    const container = compiled.blocks[0] as unknown as { children?: Array<{ id: string }> };
    const ids = (container.children ?? []).map((n) => n.id);
    expect(ids).toEqual(["p-body"]);
  });

  test("moveBlock reorders nodes within same parent", () => {
    const doc = createSampleDesignDocument();

    const moved = moveBlock(doc, { blockId: "p-body", targetId: "h-title", position: "before" });
    expect(moved.moved).toBe(true);

    const compiled = compile(moved.document);
    const container = compiled.blocks[0] as unknown as { children?: Array<{ id: string }> };
    const ids = (container.children ?? []).map((n) => n.id);
    expect(ids).toEqual(["p-body", "h-title"]);
  });

  test("page root inspector/patch updates DocumentIR.meta", () => {
    const doc = createSampleDesignDocument();

    const rootInspector = buildSelectionInspector(doc, EDITOR_PAGE_ROOT_BLOCK_ID);
    expect(rootInspector.blockId).toBe(EDITOR_PAGE_ROOT_BLOCK_ID);
    expect(rootInspector.blockType).toBe("page");

    const patched = applySelectionPatch(doc, EDITOR_PAGE_ROOT_BLOCK_ID, {
      section: "component",
      values: {
        title: { "en-US": "Home", "zh-CN": "主页" },
      },
    });

    const compiled = compile(patched.document);
    expect(compiled.meta?.title?.["en-US"]).toBe("Home");
    expect(compiled.meta?.title?.["zh-CN"]).toBe("主页");
  });

  test("setBreakpointOverride writes node.responsive and merges inspector", () => {
    const doc = createSampleDesignDocument();

    const first = setBreakpointOverride(doc, {
      blockId: "h-title",
      breakpoint: "mobile",
      patch: {
        section: "layout",
        values: { width: 320 },
      },
    });

    const node = first.document.nodesById["h-title"] as unknown as { responsive?: any };
    expect(node.responsive?.mobile?.layout?.width).toBe(320);

    const merged = buildSelectionInspectorForBreakpoint(first.document, "h-title", "mobile");
    expect(merged.layout.width).toBe(320);

    const cleared = setBreakpointOverride(first.document, {
      blockId: "h-title",
      breakpoint: "mobile",
      patch: {
        section: "layout",
        values: { width: null },
      },
    });

    const clearedNode = cleared.document.nodesById["h-title"] as unknown as { responsive?: any };
    expect(clearedNode.responsive).toBeUndefined();
  });
});
