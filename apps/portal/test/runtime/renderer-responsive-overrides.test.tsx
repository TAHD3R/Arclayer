import React from "react";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PageBlueprintRenderer } from "@celestial/renderer";
import type { PageBlueprint, ViewerContext } from "@celestial/block-protocol";

describe("site-renderer-core responsive overrides (PageBlueprint)", () => {
  test("applies node.responsive overrides for ctx.breakpoint", () => {
    const doc: PageBlueprint = {
      version: 1,
      rootId: "page",
      nodesById: {
        page: {
          id: "page",
          type: "page_root",
          name: "Page",
          children: ["a"],
          layout: { children: { mode: "absolute" } },
        },
        a: {
          id: "a",
          type: "frame",
          name: "Frame",
          children: [],
          layout: {
            self: {
              rect: { x: 0, y: 0, width: 100, height: 100 },
              alignX: "start",
              alignY: "start",
            },
            children: { mode: "absolute" },
          },
          style: { backgroundColor: "#111111" },
          responsive: {
            mobile: {
              style: { backgroundColor: "#123456" },
            },
          },
        },
      },
    };

    const ctx: ViewerContext = {
      locale: "en-US",
      breakpoint: "mobile",
    };

    const html = renderToStaticMarkup(
      <PageBlueprintRenderer
        document={doc}
        ctx={ctx}
        viewport={{ width: 375, height: 800, baseWidth: 1440, baseHeight: 800 }}
      />,
    );
    expect(html).toContain("background-color:#123456");
  });
});
