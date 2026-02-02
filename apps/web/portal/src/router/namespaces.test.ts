import { describe, expect, test } from "vitest";

import {
  getTokenFromLocationSearch,
  parsePortalRequest,
  toExternalPreviewHref,
} from "./namespaces";

describe("router/namespaces", () => {
  test("parsePortalRequest() detects public mode", () => {
    expect(parsePortalRequest("http://localhost/")).toEqual({ mode: "public" });
    expect(parsePortalRequest("/")).toEqual({ mode: "public" });
  });

  test("parsePortalRequest() detects preview mode (external namespace)", () => {
    expect(parsePortalRequest("http://localhost/__preview/about")).toEqual({ mode: "preview" });
    expect(parsePortalRequest("http://localhost/__preview/about?token=demo")).toEqual({
      mode: "preview",
      token: "demo",
    });
  });

  test("parsePortalRequest() treats editor namespace as preview mode", () => {
    expect(parsePortalRequest("http://localhost/__editor/site/demo")).toEqual({ mode: "preview" });
    expect(parsePortalRequest("http://localhost/__editor/site/demo?token=demo")).toEqual({
      mode: "preview",
      token: "demo",
    });
  });

  test("parsePortalRequest() detects preview mode (internal namespace)", () => {
    expect(parsePortalRequest("http://localhost/preview/about?token=demo")).toEqual({
      mode: "preview",
      token: "demo",
    });
  });

  test("getTokenFromLocationSearch() is tolerant and trims", () => {
    expect(getTokenFromLocationSearch(undefined)).toBeUndefined();
    expect(getTokenFromLocationSearch({})).toBeUndefined();
    expect(getTokenFromLocationSearch({ token: "" })).toBeUndefined();
    expect(getTokenFromLocationSearch({ token: "   " })).toBeUndefined();
    expect(getTokenFromLocationSearch({ token: "demo" })).toBe("demo");
    expect(getTokenFromLocationSearch({ token: " demo " })).toBe("demo");
    expect(getTokenFromLocationSearch({ token: 123 })).toBeUndefined();
  });

  test("toExternalPreviewHref() preserves token and normalizes slashes", () => {
    expect(toExternalPreviewHref("/", undefined)).toBe("/__preview");
    expect(toExternalPreviewHref("/", "demo")).toBe("/__preview?token=demo");

    expect(toExternalPreviewHref("/about", undefined)).toBe("/__preview/about");
    expect(toExternalPreviewHref("/about", "demo")).toBe("/__preview/about?token=demo");
    expect(toExternalPreviewHref("/about/", "demo")).toBe("/__preview/about?token=demo");
  });
});
