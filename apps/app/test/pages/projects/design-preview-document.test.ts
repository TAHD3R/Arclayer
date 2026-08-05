import { describe, expect, it } from "vitest";

import {
  DesignPreviewProjectionError,
  projectDesignPreviewDocument,
} from "@/pages/projects/editor/design-preview-document";
import { siteRenderDocumentFixture } from "../../fixtures/site-render-document";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    itemId: "home-page",
    hostKind: "page",
    baseContentVersionId: "home-version",
    baseVersionNumber: 2,
    visualBlueprint: {
      schemaVersion: 1,
      itemId: "home-page",
      designSystemVersionId: "design-version-1",
      designSystemManifestChecksum: `sha256:${"7".repeat(64)}`,
      componentCatalogVersion: "arclayer-wireframe-v1",
      componentCatalogChecksum: `sha256:${"8".repeat(64)}`,
      sourceWireframeChecksum: `sha256:${"a".repeat(64)}`,
      sections: [
        {
          sectionId: "hero",
          componentKey: "landing.hero",
          variantKey: "default",
          states: [
            {
              stateKey: "default",
              styleTokens: { "surface.background": "semantic.color.surface.canvas" },
            },
          ],
          responsiveOverrides: [],
          ...overrides,
        },
      ],
    },
  } as never;
}

describe("Design candidate preview projection", () => {
  it("projects resolved Design tokens without changing the canonical source document", () => {
    const document = siteRenderDocumentFixture();
    const projected = projectDesignPreviewDocument(document, candidate(), [
      {
        path: "semantic.color.surface.canvas",
        resolvedValue: "#f6f3ed",
      } as never,
    ]);

    expect(projected).not.toBe(document);
    expect(projected.renderSource).toBe("visual_blueprint");
    expect(projected.sections[0]?.componentRecipe?.states[0]?.styleValues).toMatchObject({
      "surface.background": "#f6f3ed",
    });
    expect(document.renderSource).not.toBe("visual_blueprint");
  });

  it("surfaces missing tokens and pinned component mismatches", () => {
    const document = siteRenderDocumentFixture();

    expect(() => projectDesignPreviewDocument(document, candidate(), [])).toThrow(
      DesignPreviewProjectionError,
    );
    expect(() =>
      projectDesignPreviewDocument(document, candidate({ componentKey: "landing.pricing" }), [
        {
          path: "semantic.color.surface.canvas",
          resolvedValue: "#f6f3ed",
        } as never,
      ]),
    ).toThrow(/does not match the pinned render contract/);
  });
});
