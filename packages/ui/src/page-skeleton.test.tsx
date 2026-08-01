import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageSkeleton } from "./page-skeleton";
import { Skeleton } from "./skeleton";

describe("PageSkeleton", () => {
  it.each([
    ["form", "page-skeleton-form"],
    ["table", "page-skeleton-table"],
    ["card-grid", "page-skeleton-card-grid"],
    ["split-detail", "page-skeleton-split-detail"],
  ] as const)("renders the %s page-level layout", (variant, slot) => {
    const markup = renderToStaticMarkup(<PageSkeleton variant={variant} />);

    expect(markup).toContain('data-slot="page-skeleton"');
    expect(markup).toContain(`data-slot="${slot}"`);
  });

  it("matches the expected card-grid density", () => {
    const markup = renderToStaticMarkup(<PageSkeleton variant="card-grid" />);

    expect(markup.match(/data-slot="page-skeleton-card"/g)).toHaveLength(6);
  });

  it("renders the form header, body, and expected field density", () => {
    const markup = renderToStaticMarkup(<PageSkeleton variant="form" />);

    expect(markup).toContain('data-slot="page-skeleton-header"');
    expect(markup).toContain('data-slot="page-skeleton-form-body"');
    expect(markup.match(/data-slot="page-skeleton-form-field"/g)).toHaveLength(4);
  });

  it("matches the expected table density", () => {
    const markup = renderToStaticMarkup(<PageSkeleton variant="table" />);

    expect(markup.match(/data-slot="page-skeleton-table-row"/g)).toHaveLength(6);
  });

  it("renders both sides of a split-detail layout", () => {
    const markup = renderToStaticMarkup(<PageSkeleton variant="split-detail" />);

    expect(markup.match(/data-slot="page-skeleton-master"/g)).toHaveLength(1);
    expect(markup.match(/data-slot="page-skeleton-detail"/g)).toHaveLength(1);
  });

  it("uses a neutral reduced-motion-safe skeleton primitive", () => {
    const markup = renderToStaticMarkup(<Skeleton />);

    expect(markup).toContain("bg-muted");
    expect(markup).toContain("motion-reduce:animate-none");
    expect(markup).not.toContain("bg-primary");
    expect(markup).toContain('aria-hidden="true"');
  });
});
