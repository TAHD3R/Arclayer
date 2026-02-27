import { describe, expect, test } from "vitest";

import { BlockManifestSchema } from "../src/block-manifest.zod";

describe("protocol/zod: BlockManifest (prefab slots + whitelist)", () => {
  test("valid prefab manifest passes", () => {
    const manifest = {
      type: "prefab:card",
      label: { "en-US": "Card", "zh-CN": "卡片" },
      category: "custom",
      kind: "prefab",
      supports: { children: true, layout: true, design: true, responsive: true },
      attributes: [{ key: "title", kind: "text", required: true }],
      slots: [
        {
          name: "default",
          label: { "en-US": "Default", "zh-CN": "默认" },
          allowedNodeTypes: ["text", "frame", "rect"],
          required: false,
          minChildren: 0,
          maxChildren: 5,
        },
      ],
      styleOverrideWhitelist: ["backgroundColor", "borderRadius", "typography"],
    };

    const parsed = BlockManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });

  test("invalid whitelist fails", () => {
    const manifest = {
      type: "prefab:bad",
      label: { "en-US": "Bad" },
      category: "custom",
      supports: {},
      attributes: [],
      styleOverrideWhitelist: [123],
    };

    const parsed = BlockManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });
});
