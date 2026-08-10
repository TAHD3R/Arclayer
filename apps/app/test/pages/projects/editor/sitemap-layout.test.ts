import { describe, expect, it } from "vitest";

import type { BuilderRevisionPageOut } from "@arclayer/openapi";

import { layoutSitemapPages } from "@/pages/projects/editor/sitemap-layout";

function page(
  itemId: string,
  parentItemId: string | null,
  sortOrder: number,
): BuilderRevisionPageOut {
  return {
    itemId,
    parentItemId,
    sortOrder,
    title: itemId,
    routes: [],
    wireframe: {
      sections: [
        {
          id: `${itemId}-hero`,
          label: "Hero",
          intentId: "hero",
          componentKey: "landing.hero",
          variantKey: "default",
          bindings: [],
        },
      ],
    },
  } as unknown as BuilderRevisionPageOut;
}

describe("sitemap layout", () => {
  it("centers a parent over its child subtree and keeps siblings ordered", () => {
    const result = layoutSitemapPages([
      page("home", null, 0),
      page("about", "home", 1),
      page("contact", "home", 2),
    ]);
    const home = result.pages.find((item) => item.itemId === "home");
    const about = result.pages.find((item) => item.itemId === "about");
    const contact = result.pages.find((item) => item.itemId === "contact");

    expect(home).toBeDefined();
    expect(about).toBeDefined();
    expect(contact).toBeDefined();
    expect(about!.x).toBeLessThan(contact!.x);
    expect(home!.x + home!.width / 2).toBeCloseTo(
      (about!.x + about!.width / 2 + contact!.x + contact!.width / 2) / 2,
    );
    expect(about!.y).toBeGreaterThan(home!.y);
  });

  it("places invalid parent references at the root without dropping pages", () => {
    const result = layoutSitemapPages([page("orphan", "missing", 0)]);
    expect(result.pages).toHaveLength(1);
    expect(result.bounds.width).toBeGreaterThan(0);
    expect(result.bounds.height).toBeGreaterThan(0);
  });
});
