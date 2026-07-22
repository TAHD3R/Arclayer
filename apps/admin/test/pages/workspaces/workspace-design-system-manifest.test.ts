import { describe, expect, it } from "vitest";

import {
  buildDesignSystemFoundationManifest,
  designSystemFoundationDefaults,
  validateDesignSystemFoundationValues,
} from "@/pages/workspaces/settings/workspace/design-systems/workspace-design-system-manifest";

describe("Workspace Design System foundation manifest", () => {
  it("builds a strict product-authored foundation without gated claims", () => {
    const values = designSystemFoundationDefaults(undefined, "arclayer-wireframe-v1");
    const manifest = buildDesignSystemFoundationManifest(values);

    expect(manifest.primitiveTokens?.["primitive.color.action"]?.value).toBe("#155EEF");
    expect(manifest.semanticTokens?.["semantic.color.action.primary"]?.alias).toBe(
      "primitive.color.action",
    );
    expect(manifest.themes).toEqual([
      { key: "light", name: "Light", mode: "light", overrides: {} },
    ]);
    expect(manifest.componentCatalogVersion).toBe("arclayer-wireframe-v1");
    expect(manifest.componentRecipes).toEqual([]);
    expect(manifest.assetReferences).toEqual([]);
  });

  it("preserves unedited parent manifest content while updating the foundation", () => {
    const first = buildDesignSystemFoundationManifest(
      designSystemFoundationDefaults(undefined, "arclayer-wireframe-v1"),
    );
    const source = {
      ...first,
      checksum: `sha256:${"a".repeat(64)}`,
      primitiveTokens: {
        ...first.primitiveTokens,
        "primitive.radius.card": { type: "dimension" as const, value: "0.5rem" },
      },
      extensions: { "acme:evidence": { source: "brand-review" } },
    };
    const values = { ...designSystemFoundationDefaults(source), actionColor: "#004EEB" };
    const next = buildDesignSystemFoundationManifest(values, source);

    expect(next.primitiveTokens?.["primitive.radius.card"]?.value).toBe("0.5rem");
    expect(next.primitiveTokens?.["primitive.color.action"]?.value).toBe("#004EEB");
    expect(next.extensions).toEqual(source.extensions);
    expect(next).not.toHaveProperty("checksum");
  });

  it("returns field-specific format errors before sending", () => {
    const values = {
      ...designSystemFoundationDefaults(undefined, "arclayer-wireframe-v1"),
      actionColor: "blue",
      baseFontSize: "16",
      motionDuration: "fast",
    };

    expect(validateDesignSystemFoundationValues(values)).toEqual({
      actionColor: "format",
      baseFontSize: "format",
      motionDuration: "format",
    });
  });
});
