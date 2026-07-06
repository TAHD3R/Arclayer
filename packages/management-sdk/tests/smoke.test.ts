import { describe, expect, it, vi } from "vitest";
import type { ProjectSourceFileOut, ProjectSourceManifestOut } from "@arclayer/openapi";

import {
  buildManagementProjectSourceStructure,
  buildManagementProjectSourceTree,
  buildManagementProjectSourceSettingsPatch,
  buildManagementProjectSiteSettingsPatch,
  buildManagementReactViteLandingSource,
  buildManagementReusableBlockModelContract,
  buildManagementSitePageModelContract,
  createManagementSdk,
  readManagementContentModelFieldKeys,
  readManagementContentModelFields,
} from "../src";

describe("management-sdk", () => {
  it("reads content model field schema as ordered field helpers", () => {
    const model = {
      category: "site_builder",
      fieldSchema: {
        headline: {
          label: "Headline",
          required: true,
          scalar: "text",
        },
        sections: {
          config: { itemType: "section" },
          label: "Sections",
          scalar: "json",
        },
      },
      id: "model_123",
      name: "Page",
      pluralKey: "pages",
      singularKey: "page",
      siteId: "site_123",
      updatedAt: "2026-07-06T00:00:00Z",
      workspaceId: "workspace_123",
    } as const;

    expect(readManagementContentModelFieldKeys(model)).toEqual(["headline", "sections"]);
    expect(readManagementContentModelFields(model)).toEqual([
      {
        config: null,
        key: "headline",
        label: "Headline",
        required: true,
        scalar: "text",
      },
      {
        config: { itemType: "section" },
        key: "sections",
        label: "Sections",
        required: false,
        scalar: "json",
      },
    ]);
  });

  it("surfaces invalid content model field schemas explicitly", () => {
    const model = {
      category: "site_builder",
      fieldSchema: {
        headline: {
          label: "Headline",
          scalar: "unsupported",
        },
      },
      id: "model_123",
      name: "Page",
      pluralKey: "pages",
      singularKey: "page",
      siteId: "site_123",
      updatedAt: "2026-07-06T00:00:00Z",
      workspaceId: "workspace_123",
    } as const;

    expect(() => readManagementContentModelFields(model)).toThrow(
      "MANAGEMENT_SDK_CONTENT_MODEL_FIELD_SCHEMA_INVALID",
    );
  });

  it("builds reusable React and Vite landing source operations", () => {
    const operations = buildManagementReactViteLandingSource({
      brandName: "Northstar Advisory",
      canonicalUrl: "https://northstar.example.com",
      description: "Operational finance guidance for growing teams.",
      primaryCtaLabel: "Book a strategy call",
      sections: [
        {
          body: "Cash planning and reporting rhythm.",
          key: "planning",
          title: "Strategic planning",
        },
      ],
    });

    expect(operations).toHaveLength(16);
    expect(operations.map((operation) => operation.filePath)).toEqual([
      ".env.example",
      ".gitignore",
      "README.md",
      "package.json",
      "index.html",
      "tsconfig.json",
      "tsconfig.app.json",
      "tsconfig.node.json",
      "vite.config.ts",
      "src/main.tsx",
      "src/vite-env.d.ts",
      "src/App.tsx",
      "src/index.css",
      "src/arclayer/runtime.ts",
      "src/arclayer/site-config.ts",
      "src/arclayer/content.ts",
    ]);
    const upsertByPath = new Map(
      operations.map((operation) => [
        operation.filePath,
        operation.kind === "upsert" ? operation.body : null,
      ]),
    );
    expect(upsertByPath.get("src/arclayer/runtime.ts")?.role).toBe("runtime");
    expect(upsertByPath.get("src/arclayer/site-config.ts")?.role).toBe("config");
    expect(upsertByPath.get("src/arclayer/content.ts")?.role).toBe("content");
    const sourceByPath = new Map(
      operations.map((operation) => [
        operation.filePath,
        operation.kind === "upsert" ? operation.body.contents : "",
      ]),
    );
    const appSource = sourceByPath.get("src/App.tsx") ?? "";
    const styleSource = sourceByPath.get("src/index.css") ?? "";
    expect(sourceByPath.get("package.json")).toContain('"vite": "latest"');
    expect(sourceByPath.get("package.json")).toContain('"@types/react": "latest"');
    expect(sourceByPath.get("package.json")).toContain('"@vitejs/plugin-react": "latest"');
    expect(sourceByPath.get("vite.config.ts")).toContain(
      'import react from "@vitejs/plugin-react";',
    );
    expect(sourceByPath.get("src/main.tsx")).toContain('import { App } from "./App";');
    expect(appSource).toContain('import { readContent } from "./arclayer/content";');
    expect(appSource).toContain('import { getProjectRuntimeConfig } from "./arclayer/runtime";');
    expect(appSource).toContain('import { getProjectSiteConfig } from "./arclayer/site-config";');
    expect(appSource).toContain('"/runtimes/" + runtime.runtimeId + "/delivery/pages/resolve"');
    expect(appSource).toContain("function syncWebsiteMetadata");
    expect(appSource).toContain("document.title = title");
    expect(appSource).toContain('upsertNamedMeta("robots", config.seo.robotsDirective)');
    expect(appSource).toContain('upsertPropertyMeta("og:image", config.seo.socialImageUrl)');
    expect(appSource).toContain('upsertLink("canonical", canonicalUrl)');
    expect(appSource).toContain('upsertLink("icon", config.site.faviconUrl)');
    expect(appSource).toContain('"Northstar Advisory"');
    expect(appSource).toContain('"Book a strategy call"');
    expect(styleSource).toContain("--accent: #0f766e;");
    expect(styleSource).toContain(".section-grid article");
    expect(sourceByPath.get("src/arclayer/content.ts")).toContain("VITE_ARCLAYER_DELIVERY_URL");
    expect(sourceByPath.get("src/arclayer/content.ts")).toContain(
      "deliveryBaseUrl() + normalizedPath",
    );
    expect(sourceByPath.get("src/arclayer/runtime.ts")).toContain("VITE_ARCLAYER_RUNTIME_ID");
    expect(sourceByPath.get("src/arclayer/site-config.ts")).toContain("Northstar Advisory");
    expect(sourceByPath.get("src/arclayer/site-config.ts")).toContain("socialImageUrl");
    expect(sourceByPath.get("src/arclayer/site-config.ts")).toContain("robotsDirective");
    expect(sourceByPath.get("src/arclayer/site-config.ts")).toContain("sitemapEnabled");
  });

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

  it("passes content model filters and delete calls through generated operations", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);

      if (request.method === "GET") {
        expect(url.pathname).toBe("/api/v1/projects/project_123/content/models");
        expect(url.searchParams.get("q")).toBe("article");
        expect(url.searchParams.get("category")).toBe("custom");
        expect(url.searchParams.get("model_kind")).toBe("collection_type");
        expect(url.searchParams.get("system_managed")).toBe("false");
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 0,
              prev: null,
              size: 10,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("DELETE");
      expect(url.pathname).toBe("/api/v1/projects/project_123/content/models/model_123");
      return new Response(JSON.stringify({ data: null, message: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    await sdk.content.models.list({
      category: "custom",
      modelKind: "collection_type",
      projectId: "project_123",
      query: "article",
      systemManaged: false,
    });
    const result = await sdk.content.models.delete({
      modelId: "model_123",
      projectId: "project_123",
    });

    expect(result.data).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exposes content model field type registry and JSON preview facades", async () => {
    const observed: Array<{ method: string; path: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observed.push({ method: request.method, path: url.pathname });

      if (url.pathname.endsWith("/content/models/field-types")) {
        return new Response(
          JSON.stringify({
            data: {
              fieldTypes: [
                {
                  configKind: "plain_text",
                  group: "text",
                  label: "Text",
                  scalar: "text",
                  source: "built_in",
                  uid: "text",
                },
              ],
              modelKinds: [
                {
                  defaultEditor: "visual",
                  id: "single_type",
                  labelKey: "content:model_kind.single_type",
                  descriptionKey: "content:model_kind.single_type_desc",
                },
              ],
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(url.pathname).toBe(
        "/api/v1/projects/project_123/content/models/model_123/json-preview",
      );
      return new Response(
        JSON.stringify({
          data: {
            fieldCount: 1,
            payload: { fields: { headline: { scalar: "text" } } },
            relationCount: 0,
            revision: 3,
            stage: "current_draft",
            viewCount: 0,
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const fieldTypes = await project.content.models.listFieldTypes();
    const preview = await project.content.models.getJsonPreview({ modelId: "model_123" });

    expect(fieldTypes.data.fieldTypes?.[0]?.uid).toBe("text");
    expect(preview.data.stage).toBe("current_draft");
    expect(observed).toEqual([
      { method: "GET", path: "/api/v1/projects/project_123/content/models/field-types" },
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/models/model_123/json-preview",
      },
    ]);
  });

  it("exposes content model field CRUD and reorder facades", async () => {
    const observed: Array<{ body: unknown; method: string; path: string }> = [];
    const model = {
      id: "model_123",
      fields: [
        {
          key: "headline",
          label: "Headline",
          required: true,
          scalar: "text",
        },
      ],
      modelKind: "single_type",
      name: "Landing Page",
      pluralKey: "landingPages",
      singularKey: "landingPage",
      siteId: "site_123",
      workspaceId: "workspace_123",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const text = await request.text();
      observed.push({
        body: text.length > 0 ? JSON.parse(text) : null,
        method: request.method,
        path: url.pathname,
      });

      return new Response(JSON.stringify({ data: model, message: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    await project.content.models.fields.create({
      body: {
        key: "headline",
        label: "Headline",
        required: true,
        scalar: "text",
      },
      modelId: "model_123",
    });
    await project.content.models.fields.update({
      body: {
        label: "Hero headline",
        required: false,
      },
      fieldKey: "headline",
      modelId: "model_123",
    });
    await project.content.models.fields.reorder({
      body: {
        fieldKeys: ["headline"],
      },
      modelId: "model_123",
    });
    const result = await project.content.models.fields.delete({
      fieldKey: "headline",
      modelId: "model_123",
    });

    expect(observed).toEqual([
      {
        body: {
          key: "headline",
          label: "Headline",
          required: true,
          scalar: "text",
        },
        method: "POST",
        path: "/api/v1/projects/project_123/content/models/model_123/fields",
      },
      {
        body: {
          label: "Hero headline",
          required: false,
        },
        method: "PATCH",
        path: "/api/v1/projects/project_123/content/models/model_123/fields/headline",
      },
      {
        body: {
          fieldKeys: ["headline"],
        },
        method: "POST",
        path: "/api/v1/projects/project_123/content/models/model_123/fields/reorder",
      },
      {
        body: null,
        method: "DELETE",
        path: "/api/v1/projects/project_123/content/models/model_123/fields/headline",
      },
    ]);
    expect(result.data.id).toBe("model_123");
  });

  it("exposes content item CRUD and draft publishing facades", async () => {
    const observed: Array<{ body: unknown; method: string; path: string; query: string }> = [];
    const item = {
      id: "item_123",
      modelKey: "page",
      slug: "home",
      title: "Home",
    };
    const version = {
      fieldsSnapshot: {
        headline: "Updated headline",
      },
      itemId: "item_123",
      versionNumber: 2,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: url.pathname,
        query: url.search,
      });

      if (request.method === "GET") {
        expect(url.pathname).toBe("/api/v1/projects/project_123/content/items");
        expect(url.searchParams.get("modelKey")).toBe("page");
        return new Response(
          JSON.stringify({
            data: {
              items: [item],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 10,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/content/items")) {
        expect(observed.at(-1)?.body).toEqual({
          locale: "en-US",
          modelKey: "page",
          title: "Home",
        });
        return new Response(JSON.stringify({ data: item, message: "OK" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/draft")) {
        expect(observed.at(-1)?.body).toEqual({
          fieldsSnapshot: {
            headline: "Updated headline",
          },
        });
        return new Response(JSON.stringify({ data: version, message: "OK" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/2/publish")) {
        expect(observed.at(-1)?.body).toBeNull();
        return new Response(JSON.stringify({ data: version, message: "OK" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      expect(request.method).toBe("DELETE");
      expect(url.pathname).toBe("/api/v1/projects/project_123/content/items/item_123");
      return new Response(JSON.stringify({ data: item, message: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const listed = await sdk.content.items.list({
      modelKey: "page",
      projectId: "project_123",
    });
    const created = await sdk.content.items.create({
      body: {
        locale: "en-US",
        modelKey: "page",
        title: "Home",
      },
      projectId: "project_123",
    });
    const draft = await sdk.content.items.saveDraft({
      body: {
        fieldsSnapshot: {
          headline: "Updated headline",
        },
      },
      itemId: "item_123",
      projectId: "project_123",
    });
    const published = await sdk.content.items.publishVersion({
      itemId: "item_123",
      projectId: "project_123",
      versionNumber: 2,
    });
    const deleted = await sdk.content.items.delete({
      itemId: "item_123",
      projectId: "project_123",
    });

    expect(listed.items).toEqual([item]);
    expect(created.data.id).toBe("item_123");
    expect(draft.data.versionNumber).toBe(2);
    expect(published.data.versionNumber).toBe(2);
    expect(deleted.data.id).toBe("item_123");
    expect(observed).toMatchObject([
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/items",
        query: "?modelKey=page",
      },
      { method: "POST", path: "/api/v1/projects/project_123/content/items" },
      {
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_123/versions/draft",
      },
      {
        body: null,
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_123/versions/2/publish",
      },
      { method: "DELETE", path: "/api/v1/projects/project_123/content/items/item_123" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("exposes content version component bindings, presentations, and SEO profile facades", async () => {
    const observed: Array<{ method: string; path: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observed.push({ method: request.method, path: url.pathname });

      if (url.pathname.endsWith("/bindings")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  bindingKey: "hero",
                  bindingPayload: {
                    field: "heroHeadline",
                  },
                  componentKey: "landing.hero",
                  sortOrder: 0,
                },
              ],
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.pathname.endsWith("/presentations")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  kind: "seo",
                  payload: {
                    metaTitle: "Enterprise landing page",
                  },
                },
              ],
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(url.pathname).toBe(
        "/api/v1/projects/project_123/content/items/item_123/versions/2/seo",
      );
      return new Response(
        JSON.stringify({
          data: {
            canonicalUrl: "https://example.com",
            metaDescription: "A conversion-focused page.",
            metaTitle: "Enterprise landing page",
            payload: {
              robotsDirective: "index,follow",
            },
            robotsDirective: "index,follow",
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const bindings = await project.content.items.versions.listComponentBindings({
      itemId: "item_123",
      versionNumber: 2,
    });
    const presentations = await project.content.items.versions.listPresentations({
      itemId: "item_123",
      versionNumber: 2,
    });
    const seo = await project.content.items.versions.getSeoProfile({
      itemId: "item_123",
      versionNumber: 2,
    });

    expect(bindings.data.items?.[0]?.componentKey).toBe("landing.hero");
    expect(presentations.data.items?.[0]?.kind).toBe("seo");
    expect(seo.data.metaTitle).toBe("Enterprise landing page");
    expect(observed).toEqual([
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/items/item_123/versions/2/bindings",
      },
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/items/item_123/versions/2/presentations",
      },
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/items/item_123/versions/2/seo",
      },
    ]);
  });

  it("exposes route bindings and hierarchy node facades for site IA", async () => {
    const observed: Array<{ body: unknown; method: string; path: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: url.pathname,
      });

      if (request.method === "GET" && url.pathname.endsWith("/content/routing/bindings")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "route_123",
                isActive: true,
                itemId: "item_123",
                locale: "en-US",
                path: "/",
                siteId: "site_123",
                workspaceId: "workspace_123",
              },
            ],
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "PUT" && url.pathname.endsWith("/content/routing/bindings/item_123")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "route_123",
              isActive: true,
              itemId: "item_123",
              locale: "en-US",
              path: "/",
              siteId: "site_123",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/routing/hierarchy")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "node_123",
                itemId: "item_123",
                parentItemId: null,
                siteId: "site_123",
                sortOrder: 0,
                workspaceId: "workspace_123",
              },
            ],
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("PUT");
      expect(url.pathname).toBe("/api/v1/projects/project_123/content/routing/hierarchy/item_123");
      return new Response(
        JSON.stringify({
          data: {
            id: "node_123",
            itemId: "item_123",
            parentItemId: null,
            siteId: "site_123",
            sortOrder: 0,
            workspaceId: "workspace_123",
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const bindings = await project.content.routing.listBindings();
    const binding = await project.content.routing.upsertBinding({
      body: {
        isActive: true,
        locale: "en-US",
        path: "/",
        routeMode: "static",
      },
      itemId: "item_123",
    });
    const hierarchy = await project.content.routing.listHierarchyNodes();
    const hierarchyNode = await project.content.routing.upsertHierarchyNode({
      body: {
        parentItemId: null,
        sortOrder: 0,
      },
      itemId: "item_123",
    });

    expect(bindings.data[0]?.itemId).toBe("item_123");
    expect(binding.data.itemId).toBe("item_123");
    expect(hierarchy.data[0]?.id).toBe("node_123");
    expect(hierarchyNode.data.id).toBe("node_123");
    expect(observed).toEqual([
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/content/routing/bindings",
      },
      {
        body: {
          isActive: true,
          locale: "en-US",
          path: "/",
          routeMode: "static",
        },
        method: "PUT",
        path: "/api/v1/projects/project_123/content/routing/bindings/item_123",
      },
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/content/routing/hierarchy",
      },
      {
        body: {
          parentItemId: null,
          sortOrder: 0,
        },
        method: "PUT",
        path: "/api/v1/projects/project_123/content/routing/hierarchy/item_123",
      },
    ]);
  });

  it("updates content fields through the typed draft helper and can publish", async () => {
    const observed: Array<{ body: unknown; method: string; path: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: url.pathname,
      });

      if (url.pathname.endsWith("/versions/draft")) {
        expect(request.method).toBe("POST");
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {
                propsDefaults: {
                  eyebrow: "New",
                  headline: "Build faster",
                },
                sectionKey: "hero",
                title: "Hero block",
              },
              itemId: "item_block",
              presentations: [
                {
                  kind: "form_data",
                  payload: {
                    propsDefaults: {
                      eyebrow: "New",
                      headline: "Build faster",
                    },
                    sectionKey: "hero",
                    title: "Hero block",
                  },
                },
              ],
              state: "draft",
              versionNumber: 6,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("POST");
      expect(url.pathname.endsWith("/versions/6/publish")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            createdAt: "2026-07-05T00:01:00Z",
            fieldsSnapshot: {},
            itemId: "item_block",
            presentations: [],
            state: "published",
            versionNumber: 6,
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const updated = await project.content.items.updateFields({
      changeSummary: "Update reusable block fields.",
      expectedVersion: 5,
      fields: {
        propsDefaults: {
          eyebrow: "New",
          headline: "Build faster",
        },
        sectionKey: "hero",
        title: "Hero block",
      },
      itemId: "item_block",
      publish: true,
    });

    expect(updated.draftVersion.data.versionNumber).toBe(6);
    expect(updated.publishedVersion?.data.state).toBe("published");
    expect(observed).toEqual([
      {
        body: {
          changeSummary: "Update reusable block fields.",
          expectedVersion: 5,
          fieldsSnapshot: {
            propsDefaults: {
              eyebrow: "New",
              headline: "Build faster",
            },
            sectionKey: "hero",
            title: "Hero block",
          },
          presentations: [
            {
              kind: "form_data",
              payload: {
                propsDefaults: {
                  eyebrow: "New",
                  headline: "Build faster",
                },
                sectionKey: "hero",
                title: "Hero block",
              },
            },
          ],
        },
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_block/versions/draft",
      },
      {
        body: null,
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_block/versions/6/publish",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exposes publish governance facades under releases namespace", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();

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

      if (url.pathname.endsWith("/api/v1/projects/project_123/releases/publish")) {
        expect(request.method).toBe("POST");
        expect(bodyText ? JSON.parse(bodyText) : null).toEqual({
          scheduledAt: "2026-07-08T10:00:00.000Z",
        });
        return new Response(
          JSON.stringify({
            data: {
              job: {
                id: "job_scheduled",
                status: "pending",
                type: "scheduled_publish",
              },
              release: {
                createdAt: "2026-07-06T00:00:00Z",
                id: "release_scheduled",
                isActive: false,
                releaseNumber: 12,
                scheduledAt: "2026-07-08T10:00:00.000Z",
                status: "scheduled",
              },
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_scheduled_release",
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
    const release = await sdk.releases.publish({
      body: { scheduledAt: "2026-07-08T10:00:00.000Z" },
      projectId: "project_123",
    });

    expect(impact.requestId).toBe("trace_publish_impact");
    expect(preview.data.artifacts).toEqual([]);
    expect(preview.requestId).toBe("trace_preview_contract");
    expect(dryRun.data.readinessSummary.ready).toBe(true);
    expect(dryRun.requestId).toBe("trace_dry_run");
    expect(release.data.release.status).toBe("scheduled");
    expect(release.requestId).toBe("trace_scheduled_release");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("exposes project source manifest facade", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      expect(request.url).toBe(
        "https://api.arclayer.test/api/v1/projects/project_123/source/manifest",
      );

      return new Response(
        JSON.stringify({
          data: {
            artifactStrategy: "object_storage",
            buildCommand: "pnpm build",
            files: [
              {
                contents: "export function App() { return null; }",
                language: "typescriptreact",
                path: "src/App.tsx",
                role: "entry",
              },
            ],
            framework: "react_vite",
            outputDirectory: "dist",
            packageManager: "pnpm",
            projectId: "project_123",
            rootDirectory: ".",
            sourceKind: "generated_scaffold",
            sourceProvider: "managed",
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_source_manifest",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const manifest = await sdk.source.getManifest({ projectId: "project_123" });

    expect(manifest.data.files?.[0]?.path).toBe("src/App.tsx");
    expect(manifest.requestId).toBe("trace_source_manifest");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("builds and fetches a readable project source structure", async () => {
    const files: ProjectSourceFileOut[] = [
      {
        contents: "export function App() { return null; }",
        language: "typescriptreact",
        path: "src/App.tsx",
        role: "entry",
      },
      {
        contents: "export const projectSiteConfig = {};",
        language: "typescript",
        path: "src/arclayer/site-config.ts",
        role: "config",
      },
      {
        contents: "export async function readContent() {}",
        language: "typescript",
        path: "src/arclayer/content.ts",
        role: "content",
      },
      {
        contents: "{}",
        language: "json",
        path: "package.json",
        role: "config",
      },
    ];
    const manifest: ProjectSourceManifestOut = {
      artifactStrategy: "object_storage",
      buildCommand: "pnpm build",
      files,
      framework: "react_vite",
      outputDirectory: "dist",
      packageManager: "pnpm",
      projectId: "project_123",
      rootDirectory: ".",
      sourceKind: "generated_scaffold",
      sourceProvider: "managed",
    };
    const tree = buildManagementProjectSourceTree(files);
    const structure = buildManagementProjectSourceStructure(manifest);

    expect(tree.map((node) => node.path)).toEqual(["src", "package.json"]);
    expect(tree[0]?.children.map((node) => node.path)).toEqual(["src/arclayer", "src/App.tsx"]);
    expect(structure.appEntryFile?.path).toBe("src/App.tsx");
    expect(structure.configFile?.path).toBe("src/arclayer/site-config.ts");
    expect(structure.contentFiles.map((file) => file.path)).toEqual(["src/arclayer/content.ts"]);
    expect(structure.runtimeFiles.map((file) => file.path)).toEqual([]);
    expect(structure.filesByRole.config?.map((file) => file.path)).toEqual([
      "src/arclayer/site-config.ts",
      "package.json",
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      expect(request.url).toBe(
        "https://api.arclayer.test/api/v1/projects/project_123/source/manifest",
      );
      return new Response(JSON.stringify({ data: manifest, message: "OK" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Trace-Id": "trace_source_structure",
        },
      });
    });
    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });
    const project = sdk.forProject("project_123");

    const globalStructure = await sdk.source.getStructure({ projectId: "project_123" });
    const projectStructure = await project.source.getStructure();

    expect(globalStructure.data.tree[0]?.path).toBe("src");
    expect(globalStructure.data.appEntryFile?.contents).toContain("export function App");
    expect(globalStructure.requestId).toBe("trace_source_structure");
    expect(projectStructure.data.configFile?.path).toBe("src/arclayer/site-config.ts");
    expect(projectStructure.requestId).toBe("trace_source_structure");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("selects the Astro page entry when building a project source structure", () => {
    const files: ProjectSourceFileOut[] = [
      {
        contents: "---\nimport ReactIsland from '../components/ReactIsland';\n---\n<ReactIsland />",
        language: "astro",
        path: "src/pages/index.astro",
        role: "entry",
      },
      {
        contents: "export function ReactIsland() { return null; }",
        language: "typescriptreact",
        path: "src/components/ReactIsland.tsx",
        role: "source",
      },
      {
        contents: "export const projectSiteConfig = {};",
        language: "typescript",
        path: "src/arclayer/site-config.ts",
        role: "config",
      },
      {
        contents: "export async function readContent() {}",
        language: "typescript",
        path: "src/arclayer/content.ts",
        role: "content",
      },
    ];
    const manifest: ProjectSourceManifestOut = {
      artifactStrategy: "object_storage",
      buildCommand: "pnpm build",
      files,
      framework: "astro",
      outputDirectory: "dist",
      packageManager: "pnpm",
      projectId: "project_astro",
      rootDirectory: ".",
      sourceKind: "generated_scaffold",
      sourceProvider: "managed",
    };

    const structure = buildManagementProjectSourceStructure(manifest);

    expect(structure.appEntryFile?.path).toBe("src/pages/index.astro");
    expect(structure.configFile?.path).toBe("src/arclayer/site-config.ts");
    expect(structure.contentFiles.map((file) => file.path)).toEqual(["src/arclayer/content.ts"]);
    expect(structure.tree[0]?.children.map((node) => node.path)).toEqual([
      "src/arclayer",
      "src/components",
      "src/pages",
    ]);
  });

  it("reads a project source file through the source file endpoint and preserves response metadata", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      expect(request.method).toBe("GET");
      expect(decodeURIComponent(url.pathname)).toBe(
        "/api/v1/projects/project_123/source/files/src/App.tsx",
      );

      return new Response(
        JSON.stringify({
          data: {
            contents: "export function App() { return <main>Launch</main>; }\n",
            language: "typescriptreact",
            path: "src/App.tsx",
            role: "entry",
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_source_manifest",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const file = await sdk.source.readFile({
      filePath: "src/App.tsx",
      projectId: "project_123",
    });

    expect(file.data.path).toBe("src/App.tsx");
    expect(file.data.contents).toContain("<main>Launch</main>");
    expect(file.requestId).toBe("trace_source_manifest");
    expect(file.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces a missing project source file as an API boundary error", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "PROJECT_SOURCE_FILE_NOT_FOUND",
            message: "Project source file was not found.",
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_source_missing",
            },
          },
        ),
    );

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    await expect(project.source.readFile({ filePath: "src/App.tsx" })).rejects.toMatchObject({
      code: "PROJECT_SOURCE_FILE_NOT_FOUND",
      requestId: "trace_source_missing",
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("exposes project source file mutation facades", async () => {
    const observedPaths: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observedPaths.push(decodeURIComponent(url.pathname));

      if (request.method === "PUT") {
        expect(await request.json()).toEqual({
          contents: "export function App() { return null; }\n",
        });
        return new Response(
          JSON.stringify({
            data: {
              contents: "export function App() { return null; }\n",
              language: "typescriptreact",
              path: "src/App.tsx",
              role: "entry",
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_source_upsert",
            },
          },
        );
      }

      expect(request.method).toBe("DELETE");
      return new Response(
        JSON.stringify({
          data: {
            deleted: true,
            path: "src/App.tsx",
            projectId: "project_123",
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_source_delete",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const file = await sdk.source.upsertFile({
      body: {
        contents: "export function App() { return null; }\n",
      },
      filePath: "src/App.tsx",
      projectId: "project_123",
    });
    const deleted = await sdk.source.deleteFile({
      filePath: "src/App.tsx",
      projectId: "project_123",
    });

    expect(file.data.contents.endsWith("\n")).toBe(true);
    expect(file.requestId).toBe("trace_source_upsert");
    expect(deleted.data.deleted).toBe(true);
    expect(deleted.requestId).toBe("trace_source_delete");
    expect(observedPaths).toEqual([
      "/api/v1/projects/project_123/source/files/src/App.tsx",
      "/api/v1/projects/project_123/source/files/src/App.tsx",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("applies project source patches and returns the refreshed manifest", async () => {
    const observed: Array<{ body: unknown; method: string; path: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
      });

      if (request.method === "PUT") {
        return new Response(
          JSON.stringify({
            data: {
              contents: "export function Hero() { return null; }\n",
              language: "typescriptreact",
              path: "src/components/Hero.tsx",
              role: "source",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "DELETE") {
        return new Response(
          JSON.stringify({
            data: {
              deleted: true,
              path: "src/legacy.ts",
              projectId: "project_123",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("GET");
      return new Response(
        JSON.stringify({
          data: {
            artifactStrategy: "object_storage",
            buildCommand: "pnpm build",
            files: [
              {
                contents: "export function Hero() { return null; }\n",
                language: "typescriptreact",
                path: "src/components/Hero.tsx",
                role: "source",
              },
            ],
            framework: "react_vite",
            outputDirectory: "dist",
            packageManager: "pnpm",
            projectId: "project_123",
            rootDirectory: ".",
            sourceKind: "managed_source",
            sourceProvider: "managed",
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_source_patch_manifest",
          },
        },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const manifest = await project.source.applyPatch({
      operations: [
        {
          body: {
            contents: "export function Hero() { return null; }\n",
            language: "typescriptreact",
          },
          filePath: "src/components/Hero.tsx",
          kind: "upsert",
        },
        {
          filePath: "src/legacy.ts",
          kind: "delete",
        },
      ],
    });

    expect(manifest.data.sourceKind).toBe("managed_source");
    expect(manifest.data.files?.[0]?.path).toBe("src/components/Hero.tsx");
    expect(manifest.requestId).toBe("trace_source_patch_manifest");
    expect(observed).toEqual([
      {
        body: {
          contents: "export function Hero() { return null; }\n",
          language: "typescriptreact",
        },
        method: "PUT",
        path: "/api/v1/projects/project_123/source/files/src/components/Hero.tsx",
      },
      {
        body: null,
        method: "DELETE",
        path: "/api/v1/projects/project_123/source/files/src/legacy.ts",
      },
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/source/manifest",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("updates project source settings through the source namespace", async () => {
    const observed: Array<{ body: unknown; method: string; path: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
      });

      expect(request.method).toBe("PATCH");
      expect(url.pathname).toBe("/api/v1/projects/project_123/settings/core");
      return new Response(
        JSON.stringify({
          data: {
            namespace: "project.core",
            secrets: {},
            updatedAt: "2026-07-06T00:00:00Z",
            value: {
              project_source: {
                build_command: "pnpm astro build",
                framework: "astro",
                source_provider: "git",
              },
            },
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_source_settings",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });
    const globalResult = await sdk.source.updateSettings({
      buildCommand: "pnpm astro build",
      framework: "astro",
      projectId: "project_123",
      sourceProvider: "git",
    });
    const projectResult = await sdk.forProject("project_123").source.updateSettings({
      outputDirectory: "dist/client",
    });

    expect(globalResult.requestId).toBe("trace_source_settings");
    expect(projectResult.data.namespace).toBe("project.core");
    expect(observed).toEqual([
      {
        body: {
          patch: {
            project_source: {
              build_command: "pnpm astro build",
              framework: "astro",
              source_provider: "git",
            },
          },
        },
        method: "PATCH",
        path: "/api/v1/projects/project_123/settings/core",
      },
      {
        body: {
          patch: {
            project_source: {
              output_directory: "dist/client",
            },
          },
        },
        method: "PATCH",
        path: "/api/v1/projects/project_123/settings/core",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exposes project-scoped facades for site, source, content, and releases", async () => {
    const observed: Array<{ body: unknown; method: string; path: string; query: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
        query: url.search,
      });

      if (url.pathname.endsWith("/settings/core")) {
        return new Response(
          JSON.stringify({
            data: {
              namespace: "project.core",
              value: {
                site: {
                  name: "Launch Site",
                },
              },
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.pathname.endsWith("/source/manifest")) {
        return new Response(
          JSON.stringify({
            data: {
              artifactStrategy: "object_storage",
              buildCommand: "pnpm build",
              files: [],
              framework: "react_vite",
              outputDirectory: "dist",
              packageManager: "pnpm",
              projectId: "project_123",
              rootDirectory: ".",
              sourceKind: "generated_scaffold",
              sourceProvider: "managed",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 0,
              prev: null,
              size: 10,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.pathname.endsWith("/content/models/model_123")) {
        return new Response(JSON.stringify({ data: null, message: "OK" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname.endsWith("/releases/publish")) {
        expect(request.method).toBe("POST");
        return new Response(
          JSON.stringify({
            data: {
              release: {
                createdAt: "2026-07-06T00:00:00Z",
                id: "release_scheduled",
                isActive: false,
                releaseNumber: 9,
                scheduledAt: "2026-07-08T10:00:00.000Z",
                status: "scheduled",
              },
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(url.pathname.endsWith("/releases/dry-run")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            readinessSummary: {
              ready: true,
            },
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });
    const project = sdk.forProject("project_123");

    expect(project.projectId).toBe("project_123");
    await project.site.getCoreSettings();
    await project.source.getManifest();
    await project.content.items.list({ modelKey: "page" });
    await project.content.models.delete({ modelId: "model_123" });
    await project.releases.dryRun();
    await project.releases.publish({ body: { scheduledAt: "2026-07-08T10:00:00.000Z" } });

    expect(observed).toEqual([
      { body: null, method: "GET", path: "/api/v1/projects/project_123/settings/core", query: "" },
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/source/manifest",
        query: "",
      },
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/content/items",
        query: "?modelKey=page",
      },
      {
        body: null,
        method: "DELETE",
        path: "/api/v1/projects/project_123/content/models/model_123",
        query: "",
      },
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/releases/dry-run",
        query: "",
      },
      {
        body: { scheduledAt: "2026-07-08T10:00:00.000Z" },
        method: "POST",
        path: "/api/v1/projects/project_123/releases/publish",
        query: "",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("updates enterprise landing pages through settings, content, source, and release APIs", async () => {
    const observed: Array<{ body: unknown; method: string; path: string; query: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
        query: url.search,
      });

      if (request.method === "PATCH" && url.pathname.endsWith("/settings/core")) {
        return new Response(
          JSON.stringify({
            data: {
              namespace: "project.core",
              value: {
                site: { name: "Launch Site" },
              },
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  draftVersion: 1,
                  id: "item_home",
                  locale: "en-US",
                  modelKey: "page",
                  publishedVersion: 1,
                  title: "Home",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (
        request.method === "GET" &&
        url.pathname.endsWith("/content/items/item_home/versions/1")
      ) {
        return new Response(
          JSON.stringify({
            data: {
              fieldsSnapshot: {
                heroHeadline: "Old headline",
                path: "/",
                title: "Home",
              },
              itemId: "item_home",
              state: "published",
              versionNumber: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/draft")) {
        const draftRequestBody = observed.at(-1)?.body as
          | { fieldsSnapshot?: unknown }
          | null
          | undefined;

        return new Response(
          JSON.stringify({
            data: {
              fieldsSnapshot: draftRequestBody?.fieldsSnapshot ?? {},
              itemId: "item_home",
              state: "draft",
              versionNumber: 2,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/2/publish")) {
        return new Response(
          JSON.stringify({
            data: {
              itemId: "item_home",
              state: "published",
              versionNumber: 2,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "PUT" && url.pathname.includes("/source/files/")) {
        return new Response(
          JSON.stringify({
            data: {
              contents: "export const hero = 'Launch faster';\n",
              language: "typescript",
              path: "src/arclayer/landing-copy.ts",
              role: "content",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/source/manifest")) {
        return new Response(
          JSON.stringify({
            data: {
              artifactStrategy: "object_storage",
              buildCommand: "pnpm build",
              files: [
                {
                  contents: "export const hero = 'Launch faster';\n",
                  path: "src/arclayer/landing-copy.ts",
                  role: "content",
                },
              ],
              framework: "react_vite",
              outputDirectory: "dist",
              packageManager: "pnpm",
              projectId: "project_123",
              rootDirectory: ".",
              sourceKind: "managed_source",
              sourceProvider: "managed",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/releases/dry-run")) {
        return new Response(
          JSON.stringify({
            data: {
              readinessSummary: {
                blockedItemCount: 0,
                ready: true,
                selectedItemCount: 1,
              },
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("POST");
      expect(url.pathname.endsWith("/releases/publish")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            release: {
              id: "release_2",
              isActive: true,
              releaseNumber: 2,
              status: "active",
            },
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const result = await project.site.updateEnterpriseLandingPage({
      changeSummary: "Refresh enterprise landing page hero.",
      fields: {
        heroHeadline: "Launch faster with operational clarity.",
      },
      modelKey: "page",
      publishHomepage: true,
      publishRelease: true,
      siteSettings: {
        seo: {
          defaultDescription: "Updated enterprise landing page.",
          sitemapEnabled: true,
        },
        site: {
          name: "Launch Site",
        },
        source: {
          framework: "astro",
          sourceProvider: "git",
        },
      },
      sourceOperations: [
        {
          body: {
            contents: "export const hero = 'Launch faster';\n",
            language: "typescript",
            role: "content",
          },
          filePath: "src/arclayer/landing-copy.ts",
          kind: "upsert",
        },
      ],
    });

    expect(result.homepage?.draftVersion.data.versionNumber).toBe(2);
    expect(result.homepage?.publishedVersion?.data.versionNumber).toBe(2);
    expect(result.releaseDryRun.data.readinessSummary.ready).toBe(true);
    expect(result.release?.data.release.releaseNumber).toBe(2);
    expect(result.sourceSettings?.data.namespace).toBe("project.core");
    expect(result.sourceStructure?.data.contentFiles[0]?.path).toBe("src/arclayer/landing-copy.ts");
    expect(observed).toMatchObject([
      { method: "PATCH", path: "/api/v1/projects/project_123/settings/core" },
      { method: "PATCH", path: "/api/v1/projects/project_123/settings/core" },
      {
        method: "PUT",
        path: "/api/v1/projects/project_123/source/files/src/arclayer/landing-copy.ts",
      },
      { method: "GET", path: "/api/v1/projects/project_123/source/manifest" },
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/items",
        query: "?modelKey=page&page=1&size=200",
      },
      { method: "GET", path: "/api/v1/projects/project_123/content/items/item_home/versions/1" },
      {
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/draft",
      },
      {
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/2/publish",
      },
      { method: "GET", path: "/api/v1/projects/project_123/releases/dry-run" },
      { body: null, method: "POST", path: "/api/v1/projects/project_123/releases/publish" },
    ]);
    expect(observed[0]?.body).toMatchObject({
      patch: {
        seo: {
          default_description: "Updated enterprise landing page.",
          sitemap_enabled: true,
        },
        site: {
          name: "Launch Site",
        },
      },
    });
    expect(observed[1]?.body).toEqual({
      patch: {
        project_source: {
          framework: "astro",
          source_provider: "git",
        },
      },
    });
    expect(observed[6]?.body).toMatchObject({
      changeSummary: "Refresh enterprise landing page hero.",
      expectedVersion: 1,
      fieldsSnapshot: {
        heroHeadline: "Launch faster with operational clarity.",
        path: "/",
        title: "Home",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("builds a project overview from structured project APIs", async () => {
    const observedPaths: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observedPaths.push(decodeURIComponent(url.pathname));

      if (url.pathname.endsWith("/settings/core")) {
        return new Response(
          JSON.stringify({
            data: {
              namespace: "project.core",
              value: {
                site: {
                  name: "Launch Site",
                },
              },
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_core_settings",
            },
          },
        );
      }

      if (url.pathname.endsWith("/site")) {
        return new Response(
          JSON.stringify({
            data: {
              isActive: true,
              name: "Launch Site",
              siteId: "site_123",
              slug: "launch-site",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_site",
            },
          },
        );
      }

      if (url.pathname.endsWith("/source/manifest")) {
        return new Response(
          JSON.stringify({
            data: {
              artifactStrategy: "object_storage",
              buildCommand: "pnpm build",
              files: [{ contents: "", path: "src/App.tsx", role: "entry" }],
              framework: "react_vite",
              outputDirectory: "dist",
              packageManager: "pnpm",
              projectId: "project_123",
              rootDirectory: ".",
              sourceKind: "generated_scaffold",
              sourceProvider: "managed",
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_source_manifest",
            },
          },
        );
      }

      if (url.pathname.endsWith("/domains")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  bindingId: "binding_platform",
                  certificateStatus: "platform_managed",
                  hostname: "northstar.arclayer.localhost",
                  isActive: true,
                  isPrimary: true,
                  isVerified: true,
                  projectId: "project_123",
                  runtimeId: "runtime_123",
                  siteId: "site_123",
                  source: "platform",
                  targetType: "project_runtime",
                  workspaceId: "workspace_123",
                },
              ],
              page: 1,
              pages: 1,
              size: 100,
              total: 1,
            },
            message: "OK",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Trace-Id": "trace_domains",
            },
          },
        );
      }

      expect(url.pathname.endsWith("/releases")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            items: [
              {
                createdAt: "2026-07-05T00:00:00Z",
                id: "release_123",
                isActive: true,
                releaseNumber: 7,
                sourceRef: "managed:main",
                status: "active",
              },
            ],
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_releases",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const overview = await sdk.forProject("project_123").getOverview();

    expect(overview.projectId).toBe("project_123");
    expect(overview.coreSettings.requestId).toBe("trace_core_settings");
    expect(overview.site.data.siteId).toBe("site_123");
    expect(overview.sourceManifest.data.files?.[0]?.path).toBe("src/App.tsx");
    expect(overview.sourceStructure.data.appEntryFile?.path).toBe("src/App.tsx");
    expect(overview.sourceStructure.data.tree.some((node) => node.path === "src")).toBe(true);
    expect(overview.releases.data.items?.[0]?.id).toBe("release_123");
    expect(overview.domains.items[0]?.hostname).toBe("northstar.arclayer.localhost");
    expect(overview.domains.requestId).toBe("trace_domains");
    expect(observedPaths).toEqual(
      expect.arrayContaining([
        "/api/v1/projects/project_123/settings/core",
        "/api/v1/projects/project_123/site",
        "/api/v1/projects/project_123/source/manifest",
        "/api/v1/projects/project_123/releases",
        "/api/v1/projects/project_123/domains",
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("manages project domains from both global and project-scoped SDK facades", async () => {
    const observed: Array<{ body: unknown; method: string; path: string; query: string }> = [];
    const domainBinding = {
      bindingId: "binding_custom",
      certificateStatus: "pending",
      dns: {
        txtRecordName: "_arclayer.example.com",
        txtRecordValue: "verify-token",
      },
      hostname: "www.example.com",
      isActive: false,
      isPrimary: false,
      isVerified: false,
      projectId: "project_123",
      runtimeId: "runtime_123",
      siteId: "site_123",
      source: "custom",
      targetType: "project_runtime",
      verificationToken: "verify-token",
      workspaceId: "workspace_123",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
        query: url.search,
      });

      if (request.method === "GET") {
        return new Response(
          JSON.stringify({
            data: {
              items: [domainBinding],
              page: 1,
              pages: 1,
              size: 10,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (request.method === "POST" && url.pathname.endsWith("/verify")) {
        return new Response(
          JSON.stringify({
            data: {
              binding: { ...domainBinding, isVerified: true },
              observedTxtValues: ["verify-token"],
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (request.method === "POST") {
        return new Response(JSON.stringify({ data: { binding: domainBinding }, message: "OK" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (request.method === "PATCH") {
        return new Response(
          JSON.stringify({ data: { ...domainBinding, isActive: true }, message: "OK" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ data: { bindingId: "binding_custom" }, message: "OK" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });
    const project = sdk.forProject("project_123");

    const listed = await sdk.domains.list({ page: 1, projectId: "project_123", size: 10 });
    const created = await project.domains.create({ body: { hostname: "www.example.com" } });
    const verified = await project.domains.verify({ bindingId: "binding_custom" });
    const updated = await project.domains.update({
      bindingId: "binding_custom",
      body: { isActive: true },
    });
    const deleted = await project.domains.delete({ bindingId: "binding_custom" });

    expect(listed.items[0]?.hostname).toBe("www.example.com");
    expect(created.data.binding.dns?.txtRecordValue).toBe("verify-token");
    expect(verified.data.observedTxtValues).toEqual(["verify-token"]);
    expect(updated.data.isActive).toBe(true);
    expect(deleted.data.bindingId).toBe("binding_custom");
    expect(observed).toEqual([
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/domains",
        query: "?page=1&size=10",
      },
      {
        body: { hostname: "www.example.com" },
        method: "POST",
        path: "/api/v1/projects/project_123/domains",
        query: "",
      },
      {
        body: null,
        method: "POST",
        path: "/api/v1/projects/project_123/domains/binding_custom/verify",
        query: "",
      },
      {
        body: { isActive: true },
        method: "PATCH",
        path: "/api/v1/projects/project_123/domains/binding_custom",
        query: "",
      },
      {
        body: null,
        method: "DELETE",
        path: "/api/v1/projects/project_123/domains/binding_custom",
        query: "",
      },
    ]);
  });

  it("creates a project-scoped homepage draft and ensures the page model", async () => {
    const observed: Array<{ body: unknown; method: string; path: string; query: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
        query: url.search,
      });

      if (request.method === "GET" && url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 0,
              prev: null,
              size: 200,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  draftVersion: 1,
                  id: "item_home",
                  locale: "en-US",
                  modelId: "model_page",
                  modelKey: "page",
                  publishedVersion: 1,
                  role: "page",
                  slug: "home",
                  title: "Home",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (
        request.method === "GET" &&
        url.pathname.endsWith("/content/items/item_home/versions/1")
      ) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {
                path: "/",
                title: "Home",
              },
              itemId: "item_home",
              presentations: [],
              state: "published",
              versionNumber: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 0,
              prev: null,
              size: 200,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 0,
              prev: null,
              size: 200,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 0,
              prev: null,
              size: 200,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "model_page",
              impact: { breakingChanges: [], hasBreakingChanges: false, warnings: [] },
              modelKind: "collection_type",
              name: "Page",
              pluralKey: "pages",
              singularKey: "page",
              siteId: "site_123",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "item_home",
              draftVersion: 1,
              locale: "en-US",
              modelId: "model_page",
              modelKey: "page",
              siteId: "site_123",
              title: "Launch Site",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/draft")) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {},
              itemId: "item_home",
              presentations: [],
              state: "draft",
              versionNumber: 2,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("POST");
      expect(url.pathname.endsWith("/versions/2/publish")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            createdAt: "2026-07-05T00:00:00Z",
            fieldsSnapshot: {},
            itemId: "item_home",
            presentations: [],
            state: "published",
            versionNumber: 2,
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const homepage = await project.site.createHomepageDraft({
      fields: { heroHeadline: "Launch faster" },
      locale: "en-US",
      path: "/",
      publish: true,
      title: "Launch Site",
    });

    expect(homepage.modelKey).toBe("page");
    expect(homepage.path).toBe("/");
    expect(homepage.item.data.id).toBe("item_home");
    expect(homepage.draftVersion.data.versionNumber).toBe(2);
    expect(homepage.publishedVersion?.data.state).toBe("published");
    expect(observed).toEqual([
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/content/models",
        query: "?category=site_builder&page=1&size=200",
      },
      {
        body: expect.objectContaining({
          name: "Page",
          routing: { mode: "localized", slugField: "path" },
          singularKey: "page",
        }),
        method: "POST",
        path: "/api/v1/projects/project_123/content/models",
        query: "",
      },
      {
        body: {
          locale: "en-US",
          modelKey: "page",
          title: "Launch Site",
        },
        method: "POST",
        path: "/api/v1/projects/project_123/content/items",
        query: "",
      },
      {
        body: {
          changeSummary: "Seed homepage route content.",
          expectedVersion: 1,
          fieldsSnapshot: {
            heroHeadline: "Launch faster",
            path: "/",
            title: "Launch Site",
          },
          presentations: [
            {
              kind: "form_data",
              payload: {
                heroHeadline: "Launch faster",
                path: "/",
                title: "Launch Site",
              },
            },
          ],
        },
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/draft",
        query: "",
      },
      {
        body: null,
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/2/publish",
        query: "",
      },
    ]);
  });

  it("exposes the canonical page model contract for automation callers", () => {
    expect(buildManagementSitePageModelContract()).toEqual(
      expect.objectContaining({
        capabilities: expect.arrayContaining([
          "routable",
          "visual_editable",
          "has_slots",
          "seo_managed",
        ]),
        defaultEditor: "visual",
        defaultPosture: "page",
        defaultRole: "page",
        defaultSurface: "canvas",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "title", required: true, scalar: "text" }),
          expect.objectContaining({ key: "path", required: true, scalar: "text" }),
          expect.objectContaining({ key: "heroHeadline", scalar: "text" }),
          expect.objectContaining({ key: "sections", scalar: "json" }),
        ]),
        presentation: { allowedKinds: ["form_data", "visual_blueprint", "slot_mapping", "seo"] },
        routing: { mode: "localized", slugField: "path" },
        singularKey: "page",
        surfacePolicy: { allowedSurfaces: ["canvas", "structured"] },
      }),
    );
  });

  it("exposes a reusable block model contract for site-builder automation callers", () => {
    expect(
      buildManagementReusableBlockModelContract({
        name: "Hero Block",
        pluralKey: "heroBlocks",
        singularKey: "heroBlock",
      }),
    ).toEqual(
      expect.objectContaining({
        capabilities: expect.arrayContaining([
          "visual_editable",
          "has_slots",
          "publishable",
          "localizable",
        ]),
        category: "site_builder",
        defaultEditor: "visual",
        defaultPosture: "composition",
        defaultRole: "reusable-section",
        defaultSurface: "canvas",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "title", required: true, scalar: "text" }),
          expect.objectContaining({ key: "sectionKey", required: true, scalar: "text" }),
          expect.objectContaining({ key: "propsDefaults", scalar: "json" }),
        ]),
        modelKind: "collection_type",
        name: "Hero Block",
        pluralKey: "heroBlocks",
        presentation: { allowedKinds: ["form_data", "visual_blueprint", "slot_mapping"] },
        routing: { mode: "none" },
        singularKey: "heroBlock",
        starterPackPolicy: { mode: "section" },
        surfacePolicy: { allowedSurfaces: ["canvas", "structured"] },
      }),
    );
  });

  it("builds canonical project site settings patches for automation callers", () => {
    expect(
      buildManagementProjectSiteSettingsPatch({
        analytics: {
          googleAnalytics: {
            enabled: true,
            measurementId: "G-ABC123",
          },
        },
        localization: {
          defaultLocale: "en-US",
          fallbackLocale: "en-US",
          supportedLocales: ["en-US"],
          timezone: "America/New_York",
        },
        seo: {
          defaultDescription: "A managed enterprise landing site.",
          defaultTitle: "Northstar Advisory",
          ogImageAssetId: "asset-social",
          ogImageUrl: "/assets/asset-social",
          robotsDirective: "index,follow",
          sitemapEnabled: true,
          titlePolicyV1: {
            dedupe: true,
            home_mode: "siteOnly",
            parts: [{ kind: "token", value: "pageTitle" }],
          },
        },
        site: {
          description: "Operational finance guidance for growing teams.",
          name: "Northstar Advisory",
          url: "https://northstar.example.com",
        },
        source: {
          framework: "react_vite",
        },
      }),
    ).toEqual({
      patch: {
        analytics: {
          google_analytics: {
            enabled: true,
            measurement_id: "G-ABC123",
          },
        },
        project_source: {
          artifact_strategy: "object_storage",
          build_command: "pnpm build",
          framework: "react_vite",
          output_directory: "dist",
          package_manager: "pnpm",
          root_directory: ".",
          source_provider: "managed",
        },
        seo: {
          default_description: "A managed enterprise landing site.",
          default_title: "Northstar Advisory",
          og_image_asset_id: "asset-social",
          og_image_url: "/assets/asset-social",
          robots_directive: "index,follow",
          sitemap_enabled: true,
          title_policy_v1: {
            dedupe: true,
            home_mode: "siteOnly",
            parts: [{ kind: "token", value: "pageTitle" }],
          },
        },
        site: {
          description: "Operational finance guidance for growing teams.",
          name: "Northstar Advisory",
          url: "https://northstar.example.com",
        },
        site_localization: {
          default_locale: "en-US",
          fallback_locale: "en-US",
          supported_locales: ["en-US"],
          timezone: "America/New_York",
        },
      },
    });
  });

  it("builds explicit project source settings patches without filling unrelated defaults", () => {
    expect(
      buildManagementProjectSourceSettingsPatch({
        buildCommand: "pnpm astro build",
        framework: "astro",
        sourceProvider: "git",
      }),
    ).toEqual({
      patch: {
        project_source: {
          build_command: "pnpm astro build",
          framework: "astro",
          source_provider: "git",
        },
      },
    });
  });

  it("finds the project-scoped homepage snapshot from content versions", async () => {
    const observed: Array<{ method: string; path: string; query: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observed.push({
        method: request.method,
        path: decodeURIComponent(url.pathname),
        query: url.search,
      });

      if (request.method === "GET" && url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  category: "site_builder",
                  defaultPosture: "page",
                  defaultRole: "page",
                  id: "model_page",
                  modelKind: "collection_type",
                  name: "Page",
                  pluralKey: "pages",
                  singularKey: "page",
                  siteId: "site_123",
                  workspaceId: "workspace_123",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  capabilityPackIds: [],
                  context: "site_builder",
                  derivedStatus: "published",
                  draftVersion: 3,
                  id: "item_home",
                  libraryGroup: "site-content",
                  locale: "en-US",
                  modelKey: "page",
                  publishedVersion: 2,
                  resolvedPosture: "page",
                  resolvedRole: "page",
                  role: "page",
                  siteId: "site_123",
                  slug: "home",
                  status: "published",
                  title: "Home page",
                  updatedAt: "2026-07-05T00:00:00Z",
                  visibility: "public",
                  workspaceId: "workspace_123",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("GET");
      expect(url.pathname.endsWith("/versions/3")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            createdAt: "2026-07-05T00:00:00Z",
            fieldsSnapshot: {
              heroHeadline: "Launch faster",
              heroSubheading: "A real Vite website managed by Arclayer.",
              path: "/",
              sections: [{ kind: "hero" }, { kind: "features" }, { kind: "cta" }],
              title: "Launch Site",
            },
            itemId: "item_home",
            presentations: [
              {
                kind: "form_data",
                payload: {
                  heroHeadline: "Launch faster",
                  path: "/",
                  title: "Launch Site",
                },
              },
            ],
            state: "draft",
            versionNumber: 3,
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_homepage_version",
          },
        },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const homepage = await project.site.findHomepage();

    expect(homepage?.item.id).toBe("item_home");
    expect(homepage?.modelKey).toBe("page");
    expect(homepage?.path).toBe("/");
    expect(homepage?.title).toBe("Launch Site");
    expect(homepage?.heroHeadline).toBe("Launch faster");
    expect(homepage?.heroSubheading).toBe("A real Vite website managed by Arclayer.");
    expect(homepage?.sectionsCount).toBe(3);
    expect(homepage?.version.requestId).toBe("trace_homepage_version");
    expect(observed).toEqual([
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/models",
        query: "?category=site_builder&page=1&size=200",
      },
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/items",
        query: "?modelKey=page&page=1&size=200",
      },
      {
        method: "GET",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/3",
        query: "",
      },
    ]);
  });

  it("updates an existing project-scoped homepage draft and can publish it", async () => {
    const observed: Array<{ body: unknown; method: string; path: string; query: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
        query: url.search,
      });

      if (request.method === "GET" && url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  category: "site_builder",
                  defaultPosture: "page",
                  defaultRole: "page",
                  id: "model_page",
                  name: "Page",
                  pluralKey: "pages",
                  singularKey: "page",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  capabilityPackIds: [],
                  context: "site_builder",
                  derivedStatus: "changed",
                  draftVersion: 3,
                  id: "item_home",
                  libraryGroup: "site-content",
                  locale: "en-US",
                  modelKey: "page",
                  publishedVersion: 2,
                  resolvedRole: "page",
                  role: "page",
                  slug: "home",
                  title: "Home page",
                  updatedAt: "2026-07-05T00:00:00Z",
                  visibility: "public",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/versions/3")) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {
                heroHeadline: "Old headline",
                path: "/",
                sections: [{ kind: "hero" }],
                title: "Home",
              },
              itemId: "item_home",
              presentations: [],
              state: "draft",
              versionNumber: 3,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/draft")) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:05:00Z",
              fieldsSnapshot: {
                heroHeadline: "Launch with confidence",
                path: "/company",
                sections: [{ kind: "hero" }],
                title: "Company",
              },
              itemId: "item_home",
              presentations: [],
              state: "draft",
              versionNumber: 4,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("POST");
      expect(url.pathname.endsWith("/versions/4/publish")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            createdAt: "2026-07-05T00:05:00Z",
            fieldsSnapshot: {},
            itemId: "item_home",
            presentations: [],
            state: "published",
            versionNumber: 4,
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const updated = await project.site.updateHomepageDraft({
      fields: { heroHeadline: "Launch with confidence" },
      path: "/company",
      publish: true,
      title: "Company",
    });

    expect(updated.item.id).toBe("item_home");
    expect(updated.modelKey).toBe("page");
    expect(updated.previousVersion.data.versionNumber).toBe(3);
    expect(updated.draftVersion.data.versionNumber).toBe(4);
    expect(updated.path).toBe("/company");
    expect(updated.publishedVersion?.data.state).toBe("published");
    expect(observed).toEqual([
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/content/models",
        query: "?category=site_builder&page=1&size=200",
      },
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/content/items",
        query: "?modelKey=page&page=1&size=200",
      },
      {
        body: null,
        method: "GET",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/3",
        query: "",
      },
      {
        body: {
          changeSummary: "Update homepage route content.",
          expectedVersion: 3,
          fieldsSnapshot: {
            heroHeadline: "Launch with confidence",
            path: "/company",
            sections: [{ kind: "hero" }],
            title: "Company",
          },
          presentations: [
            {
              kind: "form_data",
              payload: {
                heroHeadline: "Launch with confidence",
                path: "/company",
                sections: [{ kind: "hero" }],
                title: "Company",
              },
            },
          ],
        },
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/draft",
        query: "",
      },
      {
        body: null,
        method: "POST",
        path: "/api/v1/projects/project_123/content/items/item_home/versions/4/publish",
        query: "",
      },
    ]);
  });

  it("requires an existing homepage before updating a homepage draft", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);

      if (url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(url.pathname.endsWith("/content/items")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            items: [],
            next: null,
            page: 1,
            pages: 1,
            prev: null,
            size: 200,
            total: 0,
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    await expect(project.site.updateHomepageDraft({ title: "Company" })).rejects.toThrow(
      "MANAGEMENT_SDK_HOMEPAGE_REQUIRED",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bootstraps site content, source, release dry-run, and optional publish", async () => {
    const observed: Array<{ body: unknown; method: string; path: string; query: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
        query: url.search,
      });

      if (request.method === "GET" && url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: "model_page",
                  category: "site_builder",
                  capabilities: ["routable", "visual_editable", "publishable"],
                  name: "Page",
                  pluralKey: "pages",
                  singularKey: "page",
                  siteId: "site_123",
                  workspaceId: "workspace_123",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              next: null,
              page: 1,
              pages: 0,
              prev: null,
              size: 200,
              total: 0,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "model_reusable_block",
              category: "site_builder",
              capabilities: ["visual_editable", "has_slots", "publishable", "localizable"],
              defaultPosture: "composition",
              defaultRole: "reusable-section",
              name: "Reusable Block",
              pluralKey: "reusableBlocks",
              singularKey: "reusableBlock",
              siteId: "site_123",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "item_home",
              draftVersion: 1,
              locale: "en-US",
              modelId: "model_page",
              modelKey: "page",
              siteId: "site_123",
              title: "Launch Site",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/draft")) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {},
              itemId: "item_home",
              presentations: [],
              state: "draft",
              versionNumber: 2,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "PUT" && url.pathname.includes("/source/files/")) {
        return new Response(
          JSON.stringify({
            data: {
              contents: "export const headline = 'Launch faster';\n",
              language: "typescript",
              path: "src/arclayer/generated-content.ts",
              role: "content",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/source/manifest")) {
        return new Response(
          JSON.stringify({
            data: {
              artifactStrategy: "object_storage",
              buildCommand: "pnpm build",
              files: [{ contents: "", path: "src/arclayer/generated-content.ts", role: "content" }],
              framework: "react_vite",
              outputDirectory: "dist",
              packageManager: "pnpm",
              projectId: "project_123",
              rootDirectory: ".",
              sourceKind: "generated_scaffold",
              sourceProvider: "managed",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/routing/bindings")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "route_home",
                itemId: "item_home",
                locale: "en-US",
                path: "/",
                siteId: "site_123",
                workspaceId: "workspace_123",
              },
            ],
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/routing/hierarchy")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "node_home",
                itemId: "item_home",
                parentItemId: null,
                siteId: "site_123",
                sortOrder: 0,
                workspaceId: "workspace_123",
              },
            ],
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/versions/2/bindings")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  bindingKey: "hero",
                  componentKey: "landing.hero",
                  sortOrder: 0,
                },
              ],
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/releases/dry-run")) {
        return new Response(
          JSON.stringify({
            data: {
              readinessSummary: {
                ready: true,
              },
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("POST");
      expect(url.pathname.endsWith("/releases/publish")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            release: {
              createdAt: "2026-07-05T00:00:00Z",
              id: "release_123",
              isActive: true,
              releaseNumber: 3,
              sourceRef: "managed:main",
              status: "active",
            },
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const result = await project.site.bootstrapSite({
      homepage: {
        fields: { heroHeadline: "Launch faster" },
        locale: "en-US",
        path: "/",
        title: "Launch Site",
      },
      publishRelease: true,
      sourceOperations: [
        {
          body: {
            contents: "export const headline = 'Launch faster';\n",
            language: "typescript",
            role: "content",
          },
          filePath: "src/arclayer/generated-content.ts",
          kind: "upsert",
        },
      ],
    });

    expect(result.homepage.item.data.id).toBe("item_home");
    expect(result.reusableBlockModelKey).toBe("reusableBlock");
    expect(result.sourceManifest?.data.files?.[0]?.path).toBe("src/arclayer/generated-content.ts");
    expect(result.routeBindings.data[0]?.path).toBe("/");
    expect(result.hierarchyNodes.data[0]?.id).toBe("node_home");
    expect(result.homepageComponentBindings.data.items?.[0]?.componentKey).toBe("landing.hero");
    expect(result.releaseDryRun.data.readinessSummary.ready).toBe(true);
    expect(result.release?.data.release.releaseNumber).toBe(3);
    expect(observed.map((entry) => `${entry.method} ${entry.path}`)).toEqual([
      "GET /api/v1/projects/project_123/content/models",
      "GET /api/v1/projects/project_123/content/items",
      "GET /api/v1/projects/project_123/content/models",
      "POST /api/v1/projects/project_123/content/items",
      "POST /api/v1/projects/project_123/content/items/item_home/versions/draft",
      "GET /api/v1/projects/project_123/content/models",
      "POST /api/v1/projects/project_123/content/models",
      "PUT /api/v1/projects/project_123/source/files/src/arclayer/generated-content.ts",
      "GET /api/v1/projects/project_123/source/manifest",
      "GET /api/v1/projects/project_123/content/routing/bindings",
      "GET /api/v1/projects/project_123/content/routing/hierarchy",
      "GET /api/v1/projects/project_123/content/items/item_home/versions/2/bindings",
      "GET /api/v1/projects/project_123/releases/dry-run",
      "POST /api/v1/projects/project_123/releases/publish",
    ]);
    expect(
      observed.find((entry) => entry.method === "POST" && entry.path.endsWith("/content/models"))
        ?.body,
    ).toEqual(
      expect.objectContaining({
        defaultRole: "reusable-section",
        defaultPosture: "composition",
        defaultSurface: "canvas",
        singularKey: "reusableBlock",
      }),
    );
  });

  it("creates an enterprise landing site through the site-builder facade", async () => {
    const observed: Array<{ body: unknown; method: string; path: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      const bodyText = await request.text();
      observed.push({
        body: bodyText ? JSON.parse(bodyText) : null,
        method: request.method,
        path: decodeURIComponent(url.pathname),
      });

      if (request.method === "POST" && url.pathname.endsWith("/chat/workspace-actions")) {
        return new Response(
          JSON.stringify({
            data: {
              action: "create_project",
              content: "Created project.",
              project: {
                id: "project_123",
                name: "Northstar Advisory",
                workspaceId: "workspace_123",
              },
              navigation: {
                label: "Open project",
                path: "/projects/project_123",
              },
              toolCalls: [
                {
                  arguments: {
                    componentBindings: [
                      {
                        bindingKey: "headline",
                        componentKey: "landing.hero",
                        payload: { field: "heroHeadline" },
                      },
                      {
                        bindingKey: "subheading",
                        componentKey: "landing.hero",
                        payload: { field: "heroSubheading" },
                      },
                      {
                        bindingKey: "sections",
                        componentKey: "landing.sections",
                        payload: { field: "sections" },
                      },
                    ],
                    hierarchyNodeCount: 1,
                    hierarchyRootItemId: "item_home",
                    routePath: "/",
                  },
                  status: "completed",
                  toolName: "workspace.create_site_structure",
                },
                {
                  arguments: {
                    releaseId: "release_initial",
                    releaseNumber: 4,
                    selectionCount: 1,
                  },
                  status: "completed",
                  toolName: "workspace.publish_project_release",
                },
              ],
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "PATCH" && url.pathname.endsWith("/settings/core")) {
        return new Response(
          JSON.stringify({
            data: {
              projectId: "project_123",
              settings: {},
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/models")) {
        const finalModelList = url.searchParams.get("size") === "100";
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: "model_page",
                  category: "site_builder",
                  capabilities: ["routable", "visual_editable", "publishable"],
                  defaultRole: "page",
                  name: "Page",
                  pluralKey: "pages",
                  singularKey: "page",
                  siteId: "site_123",
                  workspaceId: "workspace_123",
                },
                ...(finalModelList
                  ? [
                      {
                        id: "model_reusable_block",
                        category: "site_builder",
                        capabilities: [
                          "visual_editable",
                          "has_slots",
                          "publishable",
                          "localizable",
                        ],
                        defaultRole: "reusable-section",
                        name: "Reusable Block",
                        pluralKey: "reusableBlocks",
                        singularKey: "reusableBlock",
                        siteId: "site_123",
                        workspaceId: "workspace_123",
                      },
                    ]
                  : []),
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: finalModelList ? 100 : 200,
              total: finalModelList ? 2 : 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  draftVersion: 1,
                  id: "item_home",
                  locale: "en-US",
                  modelId: "model_page",
                  modelKey: "page",
                  publishedVersion: 1,
                  role: "page",
                  slug: "home",
                  title: "Home",
                },
              ],
              next: null,
              page: 1,
              pages: 1,
              prev: null,
              size: 200,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (
        request.method === "GET" &&
        url.pathname.endsWith("/content/items/item_home/versions/1")
      ) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {
                path: "/",
                title: "Home",
              },
              itemId: "item_home",
              presentations: [],
              state: "published",
              versionNumber: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/content/models")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "model_reusable_block",
              category: "site_builder",
              capabilities: ["visual_editable", "has_slots", "publishable", "localizable"],
              defaultPosture: "composition",
              defaultRole: "reusable-section",
              name: "Reusable Block",
              pluralKey: "reusableBlocks",
              singularKey: "reusableBlock",
              siteId: "site_123",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/content/items")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "item_home",
              draftVersion: 1,
              locale: "en-US",
              modelId: "model_page",
              modelKey: "page",
              siteId: "site_123",
              title: "Home",
              workspaceId: "workspace_123",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/draft")) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {},
              itemId: "item_home",
              presentations: [],
              state: "draft",
              versionNumber: 2,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST" && url.pathname.endsWith("/versions/2/publish")) {
        return new Response(
          JSON.stringify({
            data: {
              createdAt: "2026-07-05T00:00:00Z",
              fieldsSnapshot: {},
              itemId: "item_home",
              presentations: [],
              state: "published",
              versionNumber: 2,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "PUT" && url.pathname.includes("/source/files/")) {
        return new Response(
          JSON.stringify({
            data: {
              contents: "",
              language: "typescript",
              path: decodeURIComponent(url.pathname.split("/source/files/")[1] ?? ""),
              role: "source",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/source/manifest")) {
        return new Response(
          JSON.stringify({
            data: {
              artifactStrategy: "object_storage",
              buildCommand: "pnpm build",
              files: [{ contents: "", path: "src/App.tsx", role: "entry" }],
              framework: "react_vite",
              outputDirectory: "dist",
              packageManager: "pnpm",
              projectId: "project_123",
              rootDirectory: ".",
              sourceKind: "generated_scaffold",
              sourceProvider: "managed",
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/domains")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  bindingId: "binding_platform",
                  certificateStatus: "platform_managed",
                  hostname: "northstar.arclayer.localhost",
                  isActive: true,
                  isPrimary: true,
                  isVerified: true,
                  projectId: "project_123",
                  runtimeId: "runtime_123",
                  siteId: "site_123",
                  source: "platform",
                  targetType: "project_runtime",
                  workspaceId: "workspace_123",
                },
              ],
              page: 1,
              pages: 1,
              size: 100,
              total: 1,
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/routing/bindings")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "route_home",
                itemId: "item_home",
                locale: "en-US",
                path: "/",
                siteId: "site_123",
                workspaceId: "workspace_123",
              },
            ],
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/content/routing/hierarchy")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "node_home",
                itemId: "item_home",
                parentItemId: null,
                siteId: "site_123",
                sortOrder: 0,
                workspaceId: "workspace_123",
              },
            ],
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "GET" && url.pathname.endsWith("/versions/2/bindings")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  bindingKey: "hero",
                  componentKey: "landing.hero",
                  sortOrder: 0,
                },
              ],
            },
            message: "OK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      expect(request.method).toBe("GET");
      expect(url.pathname.endsWith("/releases/dry-run")).toBe(true);
      return new Response(
        JSON.stringify({
          data: {
            readinessSummary: {
              ready: true,
            },
          },
          message: "OK",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const result = await sdk.siteBuilder.createEnterpriseLandingSite({
      brandName: "Northstar Advisory",
      canonicalUrl: "https://northstar.example.com",
      description: "Operational finance guidance for growing teams.",
      googleAnalyticsMeasurementId: "G-ABC123",
      heroHeadline: "Finance operations that scale.",
      primaryCtaLabel: "Book a strategy call",
      publishRelease: false,
      sections: [
        {
          body: "Forecasting, board reporting, and operating rhythm.",
          key: "planning",
          title: "Strategic planning",
        },
      ],
      workspaceId: "workspace_123",
    });

    expect(result.projectId).toBe("project_123");
    expect(result.project.projectId).toBe("project_123");
    expect(result.bootstrap.homepage.item.data.id).toBe("item_home");
    expect(result.contentModels.items.map((model) => model.singularKey)).toEqual([
      "page",
      "reusableBlock",
    ]);
    expect(result.bootstrap.sourceManifest.data.files?.[0]?.path).toBe("src/App.tsx");
    expect(result.bootstrap.sourceManifest.data.sourceKind).toBe("generated_scaffold");
    expect(result.bootstrap.routeBindings.data[0]?.path).toBe("/");
    expect(result.bootstrap.hierarchyNodes.data[0]?.id).toBe("node_home");
    expect(result.bootstrap.homepageComponentBindings.data.items?.[0]?.componentKey).toBe(
      "landing.hero",
    );
    expect(result.createProjectSiteStructure).toEqual({
      componentBindingCount: 3,
      componentBindings: [
        {
          bindingKey: "headline",
          componentKey: "landing.hero",
          payload: { field: "heroHeadline" },
        },
        {
          bindingKey: "subheading",
          componentKey: "landing.hero",
          payload: { field: "heroSubheading" },
        },
        {
          bindingKey: "sections",
          componentKey: "landing.sections",
          payload: { field: "sections" },
        },
      ],
      hierarchyNodeCount: 1,
      hierarchyRootItemId: "item_home",
      routePath: "/",
    });
    expect(result.sourceStructure.data.appEntryFile?.path).toBe("src/App.tsx");
    expect(result.sourceStructure.data.manifest.sourceKind).toBe("generated_scaffold");
    expect(result.sourceStructure.data.tree.some((node) => node.path === "src")).toBe(true);
    expect(result.bootstrap.releaseDryRun.data.readinessSummary.ready).toBe(true);
    expect(result.bootstrap.release).toBeUndefined();
    expect(result.primaryDomain?.hostname).toBe("northstar.arclayer.localhost");
    expect(result.domains.total).toBe(1);
    expect(result.summary).toEqual({
      appEntryPath: "src/App.tsx",
      componentBindingCount: 3,
      editorPath: "/projects/project_123/editor",
      homepageItemId: "item_home",
      hierarchyNodeCount: 1,
      primaryDomainHostname: "northstar.arclayer.localhost",
      projectId: "project_123",
      releaseNumber: 4,
      releaseReady: true,
      routePath: "/",
      sourceFileCount: 1,
    });
    expect(observed[0]).toEqual({
      body: {
        message:
          "Create a real enterprise landing site project for Northstar Advisory with a readable React and Vite source tree, homepage content, SEO defaults, and a preview domain.",
        mode: "build",
        workspaceId: "workspace_123",
      },
      method: "POST",
      path: "/api/v1/chat/workspace-actions",
    });
    const patchRequests = observed.filter((entry) => entry.method === "PATCH");
    expect(patchRequests.map((entry) => entry.body)).toEqual([
      expect.objectContaining({
        patch: expect.objectContaining({
          analytics: {
            google_analytics: {
              enabled: true,
              measurement_id: "G-ABC123",
            },
          },
          site: expect.objectContaining({
            name: "Northstar Advisory",
            url: "https://northstar.example.com",
          }),
        }),
      }),
      expect.objectContaining({
        patch: {
          project_source: {
            framework: "react_vite",
          },
        },
      }),
    ]);
    expect(
      observed.find((entry) => entry.method === "POST" && entry.path.endsWith("/versions/draft"))
        ?.body,
    ).toEqual(
      expect.objectContaining({
        fieldsSnapshot: expect.objectContaining({
          heroHeadline: "Finance operations that scale.",
          primaryCtaLabel: "Book a strategy call",
          sections: [
            {
              body: "Forecasting, board reporting, and operating rhythm.",
              key: "planning",
              title: "Strategic planning",
            },
          ],
        }),
      }),
    );
    expect(
      observed.filter((entry) => entry.method === "PUT" && entry.path.includes("/source/files/")),
    ).toHaveLength(0);
    expect(
      observed.filter((entry) => entry.method === "POST" && entry.path.endsWith("/content/items")),
    ).toHaveLength(0);
    expect(
      observed.filter((entry) => entry.method === "GET" && entry.path.endsWith("/source/manifest")),
    ).toHaveLength(1);

    observed.length = 0;
    await sdk.siteBuilder.createEnterpriseLandingSite({
      brandName: "Northstar Advisory",
      description: "Operational finance guidance for growing teams.",
      framework: "astro",
      publishRelease: false,
      workspaceId: "workspace_123",
    });

    expect(observed[0]).toEqual({
      body: {
        message:
          "Create a real enterprise landing site project for Northstar Advisory with a readable Astro source tree with React islands, homepage content, SEO defaults, and a preview domain.",
        mode: "build",
        workspaceId: "workspace_123",
      },
      method: "POST",
      path: "/api/v1/chat/workspace-actions",
    });
    expect(observed.filter((entry) => entry.method === "PATCH").map((entry) => entry.body)).toEqual(
      [
        expect.objectContaining({
          patch: expect.not.objectContaining({
            project_source: expect.anything(),
          }),
        }),
        expect.objectContaining({
          patch: {
            project_source: {
              framework: "astro",
            },
          },
        }),
      ],
    );
  });

  it("injects project id into project-scoped AI workspace actions", async () => {
    let observed:
      | {
          body: unknown;
          method: string;
          path: string;
        }
      | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observed = {
        body: await request.json(),
        method: request.method,
        path: url.pathname,
      };

      return new Response(
        JSON.stringify({
          data: {
            action: "read_project_source",
            content: "Opened the target project source manifest.",
            sourceManifest: {
              artifactStrategy: "object_storage",
              buildCommand: "pnpm build",
              files: [{ contents: "", path: "src/App.tsx", role: "entry" }],
              framework: "react_vite",
              outputDirectory: "dist",
              packageManager: "pnpm",
              projectId: "project_123",
              rootDirectory: ".",
              sourceProvider: "managed",
            },
            status: "completed",
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_project_ai_action",
          },
        },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const result = await project.ai.executeWorkspaceAction({
      body: {
        message: "Read this project's source files",
        mode: "build",
        workspaceId: "workspace_123",
      },
    });

    expect(observed).toEqual({
      body: {
        message: "Read this project's source files",
        mode: "build",
        projectId: "project_123",
        workspaceId: "workspace_123",
      },
      method: "POST",
      path: "/api/v1/chat/workspace-actions",
    });
    expect(result.data.action).toBe("read_project_source");
    expect(result.requestId).toBe("trace_project_ai_action");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("exposes project content model AI field updates through workspace actions", async () => {
    let observed:
      | {
          body: unknown;
          method: string;
          path: string;
        }
      | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observed = {
        body: await request.json(),
        method: request.method,
        path: url.pathname,
      };

      return new Response(
        JSON.stringify({
          data: {
            action: "update_content_model",
            content: "Updated the content model.",
            contentModel: {
              id: "model_123",
              workspaceId: "workspace_123",
              siteId: "site_123",
              singularKey: "caseStudy",
              pluralKey: "caseStudies",
              name: "Case Study",
              description: "Customer proof pages.",
              modelKind: "collection_type",
            },
            contentModels: [],
            executionSteps: [],
            kind: "tool_call",
            projects: [],
            status: "completed",
            toolCalls: [],
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_content_model_ai",
          },
        },
      );
    });

    const project = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    }).forProject("project_123");

    const result = await project.content.models.updateWithAi({
      fieldMutations: [
        {
          action: "add",
          key: "headline",
          label: "Headline",
          required: true,
          scalar: "text",
        },
      ],
      fieldOrder: ["headline"],
      modelId: "model_123",
      workspaceId: "workspace_123",
    });

    expect(observed?.method).toBe("POST");
    expect(observed?.path).toBe("/api/v1/chat/workspace-actions");
    expect(observed?.body).toEqual(
      expect.objectContaining({
        mode: "build",
        projectId: "project_123",
        workspaceId: "workspace_123",
      }),
    );
    expect(observed).toBeDefined();
    const observedBody = observed?.body as { message: string };
    expect(observedBody.message).toContain("workspace_update_content_model");
    expect(observedBody.message).toContain('"fieldMutations"');
    expect(observedBody.message).toContain('"fieldOrder"');
    expect(result.data.action).toBe("update_content_model");
    expect(result.requestId).toBe("trace_content_model_ai");
  });

  it("exposes workspace AI action facade", async () => {
    let observed:
      | {
          auth: string | null;
          body: unknown;
          method: string;
          path: string;
        }
      | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request);
      const request = input as Request;
      const url = new URL(request.url);
      observed = {
        auth: request.headers.get("authorization"),
        body: await request.json(),
        method: request.method,
        path: url.pathname,
      };

      return new Response(
        JSON.stringify({
          data: {
            action: "write_project_source_file",
            content: "Updated the project source and opened the editor.",
            sourceManifest: {
              artifactStrategy: "object_storage",
              files: [
                {
                  contents: "export function App() { return null; }",
                  path: "src/App.tsx",
                },
              ],
              framework: "react_vite",
              projectId: "project_123",
              sourceProvider: "managed",
            },
            status: "completed",
          },
          message: "OK",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Trace-Id": "trace_workspace_action",
          },
        },
      );
    });

    const sdk = createManagementSdk({
      baseUrl: "https://api.arclayer.test",
      fetch: fetchMock as typeof fetch,
      token: "mgmt_token",
    });

    const result = await sdk.ai.executeWorkspaceAction({
      body: {
        message: "Create a landing page and open the editor",
        mode: "build",
        projectId: "project_123",
        workspaceId: "workspace_123",
      },
    });

    expect(observed).toEqual({
      auth: "Bearer mgmt_token",
      body: {
        message: "Create a landing page and open the editor",
        mode: "build",
        projectId: "project_123",
        workspaceId: "workspace_123",
      },
      method: "POST",
      path: "/api/v1/chat/workspace-actions",
    });
    expect(result.data.action).toBe("write_project_source_file");
    expect(result.data.sourceManifest?.files?.[0]?.path).toBe("src/App.tsx");
    expect(result.requestId).toBe("trace_workspace_action");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
