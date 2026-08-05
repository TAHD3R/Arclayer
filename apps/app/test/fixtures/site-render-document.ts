import type { BuilderPageRenderDocumentOut } from "@arclayer/openapi";

export function siteRenderDocumentFixture(): BuilderPageRenderDocumentOut {
  return {
    schemaVersion: 1,
    renderer: { profile: "arclayer-site-v1", version: "1.0.0" },
    renderSource: "wireframe_preview",
    pins: {
      siteRevisionId: "revision-1",
      siteRevisionHash: `sha256:${"1".repeat(64)}`,
      contentStructureRevisionId: "structure-1",
      contentStructureHash: `sha256:${"2".repeat(64)}`,
      pageItemId: "home-page",
      pageContentVersionId: "home-version",
      pageVersionNumber: 3,
      designSystemId: "design-system-1",
      designSystemVersionId: "design-version-1",
      designSystemManifestChecksum: `sha256:${"3".repeat(64)}`,
      componentCatalogVersion: "arclayer-wireframe-v1",
      componentCatalogChecksum: `sha256:${"4".repeat(64)}`,
    },
    locale: "en-US",
    routePath: "/",
    theme: {
      key: "light",
      mode: "light",
      tokens: [
        { path: "semantic.color.surface.canvas", type: "color", value: "#FFFFFF" },
        { path: "semantic.color.text.primary", type: "color", value: "#111827" },
        { path: "semantic.color.action.primary", type: "color", value: "#155EEF" },
      ],
      typography: [
        {
          key: "body",
          name: "Body",
          fontFamily: ["Inter", "sans-serif"],
          fontWeight: 400,
          fontSize: "1rem",
          lineHeight: 1.5,
        },
      ],
      motion: [],
    },
    seo: { title: "Northstar" },
    sections: [
      {
        instanceId: "home-page:hero",
        sourceKind: "page",
        sourceItemId: "home-page",
        sourceContentVersionId: "home-version",
        sourceSectionId: "hero",
        referenceLineage: [],
        intentId: "intent.hero",
        componentKey: "landing.hero",
        variantKey: "default",
        label: "Hero",
        slots: [
          {
            key: "heading",
            valueKind: "text",
            value: "Build the next Northstar",
            source: "field",
            fieldKey: "heroHeading",
          },
          {
            key: "action.primary",
            valueKind: "action",
            value: { label: "Start building", action: "navigate", target: "/start" },
            source: "literal",
          },
        ],
        responsiveRules: [],
        interactionRules: [{ event: "click", action: "navigate", target: "/start" }],
        assetReferences: [],
      },
    ],
    evidence: [
      { concern: "manifest", status: "passed" },
      { concern: "publication", status: "not_evaluated" },
    ],
    renderable: true,
    documentHash: `sha256:${"5".repeat(64)}`,
  };
}
