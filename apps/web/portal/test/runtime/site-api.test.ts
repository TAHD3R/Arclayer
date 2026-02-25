import { describe, expect, it, vi } from "vitest";

import { fetchRuntimeConfigFromApi, resolveRouteFromApi } from "@/runtime/site-api";

describe("runtime/site-api (parsing)", () => {
  it("resolveRouteFromApi() parses redirect (snake_case) output", async () => {
    process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:8000";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            message: "OK",
            data: {
              match: {
                kind: "redirect",
                redirect_to: "/about",
                redirect_status: 301,
              },
              document: null,
            },
            timestamp: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const out = await resolveRouteFromApi("/old-about", "s1", { mode: "preview", token: "demo" });
    expect(out).toEqual({ kind: "redirect", to: "/about", status: 301 });
  });

  it("resolveRouteFromApi() keeps match pointers for editor optimistic lock init", async () => {
    process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:8000";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            message: "OK",
            data: {
              match: {
                kind: "route_template",
                params: { slug: "world" },
                entryId: "e1",
                revision: 2,
                revisionState: "draft",
                draftRevision: 2,
                publishedRevision: 1,
              },
              document: {
                version: 1,
                meta: { title: { "en-US": "Entry world v2" } },
                blocks: [],
              },
            },
            timestamp: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const out = await resolveRouteFromApi("/blog/world", "s1", { mode: "preview", token: "demo" });
    expect(out.kind).toBe("page");
    if (out.kind !== "page") throw new Error("unexpected kind");
    expect(out.match.kind).toBe("route_template");
    expect(out.match.params.slug).toBe("world");
    expect(out.match.draftRevision).toBe(2);
    expect(out.match.publishedRevision).toBe(1);
  });

  it("fetchRuntimeConfigFromApi() filters invalid font sources and keeps CSS vars", async () => {
    process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:8000";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            message: "OK",
            data: {
              theme: {
                cssVars: {
                  "--color-primary": "#1677ff",
                  "--bad": 123,
                },
                themeId: "@celestial/theme-modern",
                version: "0.1.0",
                tokensCssUrl: "/assets/00000000-0000-0000-0000-000000000001/theme.css",
              },
              fonts: [
                {
                  family: "Inter",
                  display: "swap",
                  sources: [{ url: "https://cdn.test/inter.woff2", format: "woff2" }, { url: "" }],
                },
                { family: "" },
              ],
            },
            timestamp: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const out = await fetchRuntimeConfigFromApi("s1", { mode: "public" });
    expect(out.theme.cssVars["--color-primary"]).toBe("#1677ff");
    expect(out.theme.cssVars["--bad"]).toBeUndefined();
    expect(out.theme.themeId).toBe("@celestial/theme-modern");
    expect(out.theme.version).toBe("0.1.0");
    expect(out.theme.tokensCssUrl).toBe("/assets/00000000-0000-0000-0000-000000000001/theme.css");
    expect(out.fonts).toHaveLength(1);
    expect(out.fonts[0]?.family).toBe("Inter");
    expect(out.fonts[0]?.display).toBe("swap");
    expect(out.fonts[0]?.sources).toEqual([
      { url: "https://cdn.test/inter.woff2", format: "woff2" },
    ]);
  });
});
