import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  officialVisitorComponentKeys,
  SiteRenderer,
  SiteRendererContractError,
  type SiteRenderDocument,
} from "../src";

function renderDocument(componentKey = "landing.hero"): SiteRenderDocument {
  return {
    schemaVersion: 1,
    renderer: { profile: "arclayer-site-v1", version: "1.0.0" },
    renderSource: "visual_blueprint",
    pins: {
      siteRevisionId: "revision-1",
      siteRevisionHash: `sha256:${"1".repeat(64)}`,
      contentStructureRevisionId: "structure-1",
      contentStructureHash: `sha256:${"2".repeat(64)}`,
      pageItemId: "page-1",
      pageContentVersionId: "version-1",
      pageVersionNumber: 3,
      designSystemId: "design-1",
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
    seo: { title: "Preview" },
    sections: [
      {
        instanceId: "page-1:hero",
        sourceKind: "page",
        sourceItemId: "page-1",
        sourceContentVersionId: "version-1",
        sourceSectionId: "hero",
        referenceLineage: [],
        intentId: "intent.hero",
        componentKey,
        variantKey: "default",
        label: "Hero",
        slots: [
          {
            key: "heading",
            valueKind: "text",
            value: "Build <script>alert('unsafe')</script> with AI",
            source: "field",
            fieldKey: "heroHeading",
          },
          {
            key: "body",
            valueKind: "rich-text",
            value: "Rich text <strong>remains text</strong> in renderer v1.",
            source: "literal",
          },
          {
            key: "action.primary",
            valueKind: "action",
            value: { label: "Get started", action: "navigate", target: "/contact" },
            source: "literal",
          },
        ],
        responsiveRules: [],
        interactionRules: [{ event: "click", action: "navigate", target: "/contact" }],
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

test("renders the pinned document as semantic text without injecting HTML", () => {
  const document = renderDocument();

  const { container } = render(<SiteRenderer document={document} />);

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Build <script>alert('unsafe')</script> with AI",
  );
  expect(screen.getByText("Rich text <strong>remains text</strong> in renderer v1.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/contact");
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("strong")).toBeNull();
});

test("rejects unknown visitor components instead of rendering a fallback", () => {
  expect(() => render(<SiteRenderer document={renderDocument("landing.unknown")} />)).toThrow(
    expect.objectContaining<Partial<SiteRendererContractError>>({
      code: "SITE_RENDERER_COMPONENT_UNKNOWN",
    }),
  );
});

test("requires the renderer profile token contract", () => {
  const document = renderDocument();
  document.theme.tokens = document.theme.tokens.filter(
    (token) => token.path !== "semantic.color.action.primary",
  );

  expect(() => render(<SiteRenderer document={document} />)).toThrow(
    expect.objectContaining<Partial<SiteRendererContractError>>({
      code: "SITE_RENDERER_TOKEN_REQUIRED",
    }),
  );
});

test("registers exactly the five official renderer v1 components", () => {
  expect(officialVisitorComponentKeys).toEqual([
    "site.header",
    "landing.hero",
    "landing.feature-grid",
    "landing.cta",
    "site.footer",
  ]);
});

test("renders visitor actions as explicitly inert controls in read-only previews", () => {
  render(<SiteRenderer document={renderDocument()} interactionMode="read-only" />);

  expect(screen.getByRole("button", { name: "Get started" })).toBeDisabled();
  expect(screen.queryByRole("link", { name: "Get started" })).not.toBeInTheDocument();
});

test("offers an accessible section-selection layer for authoring workbenches", async () => {
  const onSectionSelect = vi.fn();

  render(
    <SiteRenderer
      document={renderDocument()}
      interactionMode="read-only"
      selectedSectionId="hero"
      onSectionSelect={onSectionSelect}
      sectionSelectionLabel={(section) => `Inspect ${section.label}`}
    />,
  );

  const selector = screen.getByRole("button", { name: "Inspect Hero" });
  expect(selector).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(selector);
  expect(onSectionSelect).toHaveBeenCalledWith("hero");
});
