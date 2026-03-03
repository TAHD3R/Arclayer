import { describe, expect, it } from "vitest";

import { buildEditorIframeHref, normalizePathname } from "@celestial/editor-bridge";

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
    expect(href).toBe("/editor/site/demo/about?token=t1");
  });

  it("buildEditorIframeHref() encodes path segments (zero-trust)", () => {
    const href = buildEditorIframeHref({
      siteId: "demo",
      pathname: "/a b",
      token: "t1",
    });
    expect(href).toBe("/editor/site/demo/a%20b?token=t1");
  });

  it("buildEditorIframeHref() rejects query/hash injection in pathname", () => {
    expect(() =>
      buildEditorIframeHref({
        siteId: "demo",
        pathname: "/about?x=1",
        token: "t1",
      }),
    ).toThrowError();

    expect(() =>
      buildEditorIframeHref({
        siteId: "demo",
        pathname: "/about#frag",
        token: "t1",
      }),
    ).toThrowError();
  });

  it("buildEditorIframeHref() rejects path traversal and ambiguous segments", () => {
    expect(() =>
      buildEditorIframeHref({
        siteId: "demo",
        pathname: "/../secret",
        token: "t1",
      }),
    ).toThrowError();

    expect(() =>
      buildEditorIframeHref({
        siteId: "demo",
        pathname: "/a//b",
        token: "t1",
      }),
    ).toThrowError();
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
      "http://localhost:3100/editor/site/demo?token=t1&parentOrigin=http%3A%2F%2Flocalhost%3A5173",
    );
  });

  it("buildEditorIframeHref() double-encodes already-encoded segments to remain deterministic", () => {
    const href = buildEditorIframeHref({
      siteId: "demo",
      pathname: "/a%2Fb",
      token: "t1",
    });
    expect(href).toBe("/editor/site/demo/a%252Fb?token=t1");
  });
});
