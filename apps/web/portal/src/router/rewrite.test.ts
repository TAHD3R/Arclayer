import { describe, expect, test } from "vitest";

import { rewritePortalInputPathname, rewritePortalOutputPathname } from "./rewrite";

describe("router/rewrite", () => {
  test("rewritePortalInputPathname() rewrites external namespaces to internal ones", () => {
    expect(rewritePortalInputPathname("/__preview")).toBe("/preview");
    expect(rewritePortalInputPathname("/__preview/about")).toBe("/preview/about");

    expect(rewritePortalInputPathname("/__editor-host")).toBe("/editor-host");
    expect(rewritePortalInputPathname("/__editor/site/demo")).toBe("/editor/site/demo");
  });

  test("rewritePortalOutputPathname() rewrites internal namespaces to external ones", () => {
    expect(rewritePortalOutputPathname("/preview")).toBe("/__preview");
    expect(rewritePortalOutputPathname("/preview/about")).toBe("/__preview/about");

    expect(rewritePortalOutputPathname("/editor-host")).toBe("/__editor-host");
    expect(rewritePortalOutputPathname("/editor/site/demo")).toBe("/__editor/site/demo");
  });

  test("rewritePortal*Pathname() keeps normal routes unchanged", () => {
    expect(rewritePortalInputPathname("/")).toBe("/");
    expect(rewritePortalInputPathname("/about")).toBe("/about");
    expect(rewritePortalOutputPathname("/")).toBe("/");
    expect(rewritePortalOutputPathname("/about")).toBe("/about");
  });
});
