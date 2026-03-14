import { describe, expect, it, vi } from "vitest";

import { HttpError } from "@/runtime/http-error";
import { resolveRouteFromPublishedGraph } from "@/runtime/content/graph-resolver";

function createPageBlueprint(title: string) {
  return {
    version: 1,
    rootId: "page",
    nodesById: {
      page: {
        id: "page",
        type: "page_root",
        name: "Page",
        children: [],
        seo: {
          title: {
            "en-US": title,
          },
        },
        layout: {
          children: { mode: "absolute" },
        },
      },
    },
  };
}

describe("runtime/content/graph-resolver", () => {
  it("returns graph-backed page payload without requiring legacy pageBlueprint", async () => {
    process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:8000";

    const fetchSpy = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: "OK",
          data: {
            match: {
              kind: "page",
              params: {},
              pageId: "p-home",
            },
            graph: {
              document: createPageBlueprint("Home"),
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const resolved = await resolveRouteFromPublishedGraph("/", {
      siteId: "site-1",
      mode: "public",
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/published-graph/resolve");
    expect(resolved.kind).toBe("page");
    if (resolved.kind !== "page") {
      throw new Error("Expected page payload");
    }
    expect(resolved.document.rootId).toBe("page");
    expect(resolved.match.kind).toBe("page");
  });

  it("fails loudly when graph document is missing", async () => {
    process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:8000";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            message: "OK",
            data: {
              match: { kind: "page", params: {} },
              pageBlueprint: createPageBlueprint("Legacy"),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await expect(
      resolveRouteFromPublishedGraph("/legacy", {
        siteId: "site-1",
        mode: "public",
      }),
    ).rejects.toMatchObject<HttpError>({
      status: 503,
      message: "Published graph document missing or invalid.",
    });
  });

  it("returns not_found directly from graph route match", async () => {
    process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:8000";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            message: "OK",
            data: {
              match: { kind: "not_found", params: {} },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const resolved = await resolveRouteFromPublishedGraph("/missing", {
      siteId: "site-1",
      mode: "public",
    });

    expect(resolved).toEqual({ kind: "not_found" });
  });
});
