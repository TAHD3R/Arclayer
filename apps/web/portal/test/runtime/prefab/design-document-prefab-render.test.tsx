import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DesignDocumentRenderer } from "@celestial/site-renderer-core";
import type { DesignDocumentV1, ViewerContext } from "@celestial/site-block-protocol";

describe("DesignDocumentRenderer + PrefabRegistry (phase 3 acceptance)", () => {
  test("prefab instance renders with built-in registry; expanded template ids stay DesignDocument-safe; slot subtrees are copied", () => {
    const doc: DesignDocumentV1 = {
      version: 1,
      rootId: "page",
      nodesById: {
        page: {
          id: "page",
          type: "page_root",
          name: "Page",
          children: ["prefab:1"],
          layout: { children: { mode: "absolute" } },
        },
        "prefab:1": {
          id: "prefab:1",
          type: "prefab_instance",
          name: "Card",
          prefabId: "card",
          props: {
            title: { kind: "literal", value: { "en-US": "Hello", "zh-CN": "你好" } },
            description: { kind: "literal", value: { "en-US": "World", "zh-CN": "世界" } },
          },
          slotChildren: {
            default: ["slotRoot"],
          },
          layout: {
            self: {
              rect: { x: 20, y: 20, width: 360, height: 240 },
              constraints: { horizontal: "left", vertical: "top" },
              alignX: "start",
              alignY: "start",
            },
            children: { mode: "absolute" },
          },
        },
        slotRoot: {
          id: "slotRoot",
          type: "frame",
          name: "SlotRoot",
          children: ["slotRect"],
          layout: {
            self: {
              rect: { x: 0, y: 0, width: 100, height: 20 },
              constraints: { horizontal: "left", vertical: "top" },
              alignX: "start",
              alignY: "start",
            },
            children: { mode: "absolute" },
          },
        },
        slotRect: {
          id: "slotRect",
          type: "rect",
          name: "Rect",
          layout: {
            self: {
              rect: { x: 0, y: 0, width: 40, height: 10 },
              constraints: { horizontal: "left", vertical: "top" },
              alignX: "start",
              alignY: "start",
            },
            children: { mode: "absolute" },
          },
          style: { backgroundColor: "#ff0000" },
        },
      },
    };

    const viewerCtx: ViewerContext = {
      locale: "en-US",
      fallbackLocale: "zh-CN",
      routeParams: {},
      variantId: null,
      mode: "light",
      breakpoint: "desktop",
    };

    const html = renderToString(
      <DesignDocumentRenderer
        document={doc}
        ctx={viewerCtx}
        viewport={{ width: 1440, height: 800, baseWidth: 1440 }}
      />,
    );

    // If prefab expansion generates unsafe ids or fails to copy slot subtree, subdocument validation will fail.
    expect(html).not.toContain('data-celestial="subdocument-invalid"');
    // Sanity: card template should render a subtree; the root wrapper exists.
    expect(html).toContain('data-prefab-id="card"');
    // Slot subtree nodes should still exist after expansion (rendered with data-node-id).
    expect(html).toContain('data-node-id="slotRect"');
  });
});
