import { describe, expect, it, vi } from "vitest";

import { createDeliverySdk } from "../src";

describe("delivery-sdk", () => {
  it("resolves pages through delivery REST", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      expect(request.url).toBe(
        "https://api.arclayer.test/api/v1/sites/site_123/delivery/pages/resolve?path=%2Fblog%2Fhello-world&perspective=preview&token=preview_token",
      );
      expect(request.headers.get("x-api-key")).toBe("delivery_key");

      return new Response(
        JSON.stringify({
          data: {
            context: null,
            document: null,
            match: {
              kind: "dynamic",
              params: {
                slug: "hello-world",
              },
            },
            pageMeta: null,
            warnings: null,
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_delivery_rest",
          },
        },
      );
    });

    const sdk = createDeliverySdk({
      baseUrl: "https://api.arclayer.test/",
      deliveryKey: "delivery_key",
      fetch: fetchMock as typeof fetch,
    });

    const result = await sdk.pages.resolve({
      path: "/blog/hello-world",
      perspective: "preview",
      previewToken: "preview_token",
      siteId: "site_123",
    });

    expect(result.data.match.kind).toBe("dynamic");
    expect(result.requestId).toBe("trace_delivery_rest");
  });

  it("reads reusable sections and global sets through delivery REST", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);

      if (url.pathname.endsWith("/delivery/sections/header")) {
        expect(url.searchParams.get("perspective")).toBe("published");
        expect(url.searchParams.get("token")).toBeNull();
        return new Response(
          JSON.stringify({
            data: {
              alias: "header",
              document: {
                layout: null,
                sections: [],
              },
              draftRevision: 3,
              id: "section_1",
              publishedRevision: 2,
              revision: 2,
              revisionState: "published",
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_section",
            },
          },
        );
      }

      expect(url.pathname.endsWith("/delivery/global-sets/navigation")).toBe(true);
      expect(url.searchParams.get("perspective")).toBe("preview");
      expect(url.searchParams.get("token")).toBe("preview_token");
      return new Response(
        JSON.stringify({
          data: {
            items: [
              {
                key: "header",
                payload: {
                  alias: "header",
                },
              },
            ],
            key: "navigation",
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_global_set",
          },
        },
      );
    });

    const sdk = createDeliverySdk({
      baseUrl: "https://api.arclayer.test/",
      deliveryKey: "delivery_key",
      fetch: fetchMock as typeof fetch,
    });

    const section = await sdk.sections.byAlias({
      alias: "header",
      siteId: "site_123",
    });
    const globalSet = await sdk.globalSets.resolve({
      key: "navigation",
      perspective: "preview",
      previewToken: "preview_token",
      siteId: "site_123",
    });

    expect(section.data.alias).toBe("header");
    expect(section.requestId).toBe("trace_section");
    expect(globalSet.data.key).toBe("navigation");
    expect(globalSet.requestId).toBe("trace_global_set");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("executes typed graphql documents", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.variables.slug).toBe("hello-world");

      return new Response(
        JSON.stringify({
          data: {
            articleBySlug: {
              id: "item_1",
              locale: "en-US",
              revision: 1,
              revisionState: "published",
              draftRevision: 1,
              publishedRevision: 1,
              title: "Hello world",
              slug: "hello-world",
              summary: null,
              content: "hello",
              publishedAt: null,
              customFields: {
                rating: 5,
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_delivery_graphql",
          },
        },
      );
    });

    const sdk = createDeliverySdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
    });

    const result = await sdk.content.articleBySlug({
      perspective: "published",
      siteId: "site_123",
      slug: "hello-world",
    });

    expect(result.data.articleBySlug?.customFields.rating).toBe(5);
    expect(result.requestId).toBe("trace_delivery_graphql");
  });

  it("raises DeliveryGraphQLError on graphql errors", async () => {
    const sdk = createDeliverySdk({
      baseUrl: "https://api.arclayer.test",
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                articleBySlug: null,
              },
              errors: [
                {
                  extensions: {
                    code: "GRAPHQL_SCOPE_REQUIRED",
                  },
                  message: "GraphQL scope required",
                },
              ],
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Trace-Id": "trace_graphql_error",
              },
            },
          ),
      ) as typeof fetch,
    });

    await expect(
      sdk.content.articleBySlug({
        perspective: "published",
        siteId: "site_123",
        slug: "hello-world",
      }),
    ).rejects.toMatchObject({
      requestId: "trace_graphql_error",
      status: 200,
    });
  });

  it("raises DeliveryApiError on REST envelope failures", async () => {
    const sdk = createDeliverySdk({
      baseUrl: "https://api.arclayer.test",
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "PAGE_ROUTE_NOT_FOUND",
              message: "Route not found",
            }),
            {
              status: 404,
              headers: {
                "Content-Type": "application/json",
                "X-Trace-Id": "trace_page_missing",
              },
            },
          ),
      ) as typeof fetch,
    });

    await expect(
      sdk.pages.resolve({
        path: "/missing",
        siteId: "site_123",
      }),
    ).rejects.toMatchObject({
      code: "PAGE_ROUTE_NOT_FOUND",
      requestId: "trace_page_missing",
      status: 404,
    });
  });
});
