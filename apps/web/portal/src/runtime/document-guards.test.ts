import { describe, expect, test } from "vitest";

import { isCoreDocumentIR } from "@celestial/site-renderer-core";

describe("site-renderer-core guards (imported via Portal)", () => {
  test("accepts a minimal CoreDocumentIR", () => {
    const doc = {
      version: 1,
      blocks: [
        {
          id: "h1",
          type: "heading",
          props: { level: 1, text: { "en-US": "Hello", "zh-CN": "你好" } },
        },
      ],
    };

    expect(isCoreDocumentIR(doc)).toBe(true);
  });

  test("rejects unknown props (schema allowlist)", () => {
    const doc = {
      version: 1,
      blocks: [
        {
          id: "h1",
          type: "heading",
          props: { level: 1, text: { "en-US": "Hello" }, hacked: true },
        },
      ],
    };

    expect(isCoreDocumentIR(doc)).toBe(false);
  });

  test("rejects invalid nested children", () => {
    const doc = {
      version: 1,
      blocks: [
        {
          id: "c1",
          type: "container",
          props: { as: "section" },
          children: [
            {
              id: "bad",
              type: "heading",
              props: { level: 9, text: { "en-US": "Nope" } },
            },
          ],
        },
      ],
    };

    expect(isCoreDocumentIR(doc)).toBe(false);
  });
});
