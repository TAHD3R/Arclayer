import { describe, expect, it } from "vitest";

import { buildEditorIframeHref, normalizePathname } from "@celestial/site-editor-bridge";

describe("site-editor-bridge url helpers (imported via Portal)", () => {
  it("normalizePathname() normalizes leading and trailing slashes", () => {
    expect(normalizePathname("about")).toBe("/about");
    expect(normalizePathname("/about/")).toBe("/about");
    expect(normalizePathname("/")).toBe("/");
  });

  it("buildEditorIframeHref() builds a relative href by default", () => {
    const href = buildEditorIframeHref({
      siteId: "demo",
      pathname: "/about",
      token: "t1",
    });
    expect(href).toBe("/__editor/site/demo/about?token=t1");
  });

  it("buildEditorIframeHref() builds an absolute href when portalOrigin is provided", () => {
    const href = buildEditorIframeHref({
      portalOrigin: "http://localhost:3100",
      siteId: "demo",
      pathname: "/",
      token: "t1",
      parentOrigin: "http://localhost:5173",
    });
    expect(href).toBe(
      "http://localhost:3100/__editor/site/demo?token=t1&parentOrigin=http%3A%2F%2Flocalhost%3A5173",
    );
  });
});
