import { describe, expect, test } from "vitest";

import { isPageBlueprint } from "@celestial/renderer";

describe("site-renderer-core guards (imported via Portal)", () => {
  test("accepts a minimal PageBlueprint", () => {
    const doc = {
      version: 1,
      rootId: "page",
      nodesById: {
        page: {
          id: "page",
          type: "page_root",
          children: ["t1"],
          layout: { children: { mode: "absolute" } },
        },
        t1: { id: "t1", type: "text", text: { "en-US": "Hello", "zh-CN": "你好" }, tag: "h1" },
      },
    };

    expect(isPageBlueprint(doc)).toBe(true);
  });

  test("rejects wrong version", () => {
    const doc = {
      version: 2,
      rootId: "page",
      nodesById: {},
    };

    expect(isPageBlueprint(doc)).toBe(false);
  });

  test("rejects missing root node", () => {
    const doc = {
      version: 1,
      rootId: "missing",
      nodesById: {},
    };

    expect(isPageBlueprint(doc)).toBe(false);
  });
});
