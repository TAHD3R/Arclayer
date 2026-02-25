import { describe, expect, test } from "vitest";

import type { CoreDocumentIR } from "@celestial/site-renderer-core";

import {
  applySelectionPatch,
  buildLayerTree,
  buildSelectionInspector,
  commitEditorHistory,
  createEditorHistory,
  insertBlock,
  redoEditorHistory,
  undoEditorHistory,
} from "@/views/editor/editor-document-state";

function createSampleDocument(): CoreDocumentIR {
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

describe("editor document state", () => {
  test("buildSelectionInspector extracts block sections", () => {
    const doc = createSampleDocument();

    const inspector = buildSelectionInspector(doc, "h-title");

    expect(inspector.blockId).toBe("h-title");
    expect(inspector.blockType).toBe("heading");
    expect(inspector.component).toMatchObject({ level: 1, align: "left" });
    expect(inspector.animation).toMatchObject({ type: "fade", durationMs: 220 });
  });

  test("applySelectionPatch updates component and layout fields", () => {
    const doc = createSampleDocument();

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

  test("insertBlock appends into selected container", () => {
    const doc = createSampleDocument();

    const inserted = insertBlock(doc, {
      type: "heading",
      targetBlockId: "c-root",
      position: "inside",
    });

    const tree = buildLayerTree(inserted.document);
    const root = tree[0];
    expect(root).toBeDefined();
    if (!root) return;
    expect(root.id).toBe("c-root");
    expect(root.children).toHaveLength(3);
    expect(inserted.selectedBlockId).toMatch(/^b-/);
  });

  test("history supports commit undo redo", () => {
    const doc = createSampleDocument();
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
});
