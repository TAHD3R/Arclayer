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

  test("content_ref node passes", () => {
    const doc = {
      version: 1,
      rootId: "page",
      nodesById: {
        page: {
          id: "page",
          type: "page_root",
          children: ["ref1"],
          layout: { children: { mode: "absolute" } },
        },
        ref1: {
          id: "ref1",
          type: "content_ref",
          refEntryId: "entry_123",
          refState: "auto",
        },
      },
    };

    const parsed = DesignDocumentV1Schema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  test("content_ref with children fails", () => {
    const doc = {
      version: 1,
      rootId: "page",
      nodesById: {
        page: {
          id: "page",
          type: "page_root",
          children: ["ref1"],
          layout: { children: { mode: "absolute" } },
        },
        ref1: {
          id: "ref1",
          type: "content_ref",
          refEntryId: "entry_123",
          refState: "auto",
          children: [],
        },
      },
    };

    const parsed = DesignDocumentV1Schema.safeParse(doc);
    expect(parsed.success).toBe(false);
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
