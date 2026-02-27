import { describe, expect, test } from "vitest";

import { DesignDocumentV1Schema } from "../src/design-document.zod";

describe("protocol/zod: DesignDocumentV1", () => {
  test("valid document passes", () => {
    const doc = {
      version: 1,
      rootId: "page",
      nodesById: {
        page: {
          id: "page",
          type: "page_root",
          children: ["t1"],
          layout: { children: { mode: "absolute" } },
          seo: { title: { "en-US": "Hello" } },
        },
        t1: {
          id: "t1",
          type: "text",
          text: { "en-US": "Hello" },
          tag: "h1",
          layout: {
            self: { rect: { x: 0, y: 0, width: 720, height: 0 } },
            children: { mode: "absolute" },
          },
        },
      },
    };

    const parsed = DesignDocumentV1Schema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  test("missing root node fails", () => {
    const doc = {
      version: 1,
      rootId: "missing",
      nodesById: {},
    };
    const parsed = DesignDocumentV1Schema.safeParse(doc);
    expect(parsed.success).toBe(false);
  });
});
