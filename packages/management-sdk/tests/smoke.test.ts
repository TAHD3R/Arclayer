import { describe, expect, it, vi } from "vitest";

import { createManagementSdk } from "../src";

describe("management-sdk", () => {
  it("adds bearer auth and unwraps paged data", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      expect(request.url).toBe(
        "https://api.arclayer.test/api/v1/projects/project_123/content/models?page=2&size=5",
      );
      const headers = request.headers;
      expect(headers.get("authorization")).toBe("Bearer mgmt_token");

      return new Response(
        JSON.stringify({
          data: {
            items: [{ id: "model_1", key: "article", name: "Article" }],
            next: null,
            page: 2,
            pages: 3,
            prev: 1,
            size: 5,
            total: 11,
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_models",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test/",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const result = await sdk.content.models.list({
      page: 2,
      projectId: "project_123",
      size: 5,
    });

    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
    expect(result.requestId).toBe("trace_models");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("turns api envelopes into ManagementApiError", async () => {
    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "CONTENT_MODEL_LOCKED",
              message: "Model is locked",
              meta: {
                details: {
                  modelId: "model_locked",
                },
              },
            }),
            {
              status: 409,
              headers: {
                "Content-Type": "application/json",
                "X-Trace-Id": "trace_error",
              },
            },
          ),
      ) as typeof fetch,
      token: "mgmt_token",
    });

    await expect(
      sdk.content.models.create({
        body: {
          category: "content_library",
          defaultEditor: "form",
          pluralKey: "articles",
          singularKey: "article",
          name: "Article",
        },
        projectId: "project_123",
      }),
    ).rejects.toMatchObject({
      code: "CONTENT_MODEL_LOCKED",
      requestId: "trace_error",
      status: 409,
    });
  });

  it("exposes publish governance facades under releases namespace", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);

      if (url.pathname.endsWith("/api/v1/projects/project_123/publish/impact")) {
        return new Response(
          JSON.stringify({
            data: {
              readinessSummary: {
                blockerCodes: [],
                ready: true,
              },
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_publish_impact",
            },
          },
        );
      }

      if (url.pathname.endsWith("/api/v1/projects/project_123/publish/preview-contract")) {
        return new Response(
          JSON.stringify({
            data: {
              artifacts: [],
              routePointers: [],
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_preview_contract",
            },
          },
        );
      }

      expect(url.pathname.endsWith("/api/v1/projects/project_123/releases/dry-run")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            impact: {
              readinessSummary: {
                ready: true,
              },
            },
            readinessSummary: {
              blockerCodes: [],
              ready: true,
            },
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_dry_run",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const impact = await sdk.releases.publishImpact({ projectId: "project_123" });
    const preview = await sdk.releases.publishPreviewContract({ projectId: "project_123" });
    const dryRun = await sdk.releases.dryRun({ projectId: "project_123" });

    expect(impact.requestId).toBe("trace_publish_impact");
    expect(preview.data.artifacts).toEqual([]);
    expect(preview.requestId).toBe("trace_preview_contract");
    expect(dryRun.data.readinessSummary.ready).toBe(true);
    expect(dryRun.requestId).toBe("trace_dry_run");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
