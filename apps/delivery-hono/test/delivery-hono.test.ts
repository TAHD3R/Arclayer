import { InMemoryArtifactLoader } from "@/artifact-loader";
import { createDeliveryAdapter } from "@/index";
import type { TenantConfig } from "@/site-resolver";

describe("delivery-hono adapter", () => {
  const tenants: TenantConfig[] = [
    {
      tenantId: "tenant-acme",
      workspaceId: "ws-acme",
      siteId: "site-acme",
      host: "acme.local",
      pathPrefix: "/site",
      defaultLocale: "en-US",
    },
  ];

  it("resolves tenant host/path and returns html artifact", async () => {
    const loader = new InMemoryArtifactLoader({
      routePointers: [
        {
          tenantId: "tenant-acme",
          locale: "en-US",
          path: "/about",
          artifactKey: "artifact-about-v1",
        },
      ],
      artifacts: [
        {
          tenantId: "tenant-acme",
          artifactKey: "artifact-about-v1",
          kind: "html",
          html: "<html><body>About</body></html>",
          etag: '"about-v1"',
        },
      ],
    });

    const adapter = createDeliveryAdapter({ tenants, loader });
    const response = await adapter.fetch(new Request("https://acme.local/site/about"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("etag")).toBe('"about-v1"');
    await expect(response.text()).resolves.toContain("About");
  });

  it("returns json payload artifact", async () => {
    const loader = new InMemoryArtifactLoader({
      routePointers: [
        {
          tenantId: "tenant-acme",
          locale: "en-US",
          path: "/api/home",
          artifactKey: "artifact-home-v1",
        },
      ],
      artifacts: [
        {
          tenantId: "tenant-acme",
          artifactKey: "artifact-home-v1",
          kind: "json",
          payload: {
            title: "Home",
            blocks: ["hero"],
          },
        },
      ],
    });

    const adapter = createDeliveryAdapter({ tenants, loader });
    const response = await adapter.fetch(new Request("https://acme.local/site/api/home"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      data: {
        title: "Home",
        blocks: ["hero"],
      },
      artifactKey: "artifact-home-v1",
    });
  });

  it("returns explicit route pointer missing failure", async () => {
    const loader = new InMemoryArtifactLoader({
      routePointers: [],
      artifacts: [],
    });

    const adapter = createDeliveryAdapter({ tenants, loader });
    const response = await adapter.fetch(new Request("https://acme.local/site/missing"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "ROUTE_POINTER_NOT_FOUND",
      path: "/missing",
    });
  });

  it("returns explicit artifact missing failure", async () => {
    const loader = new InMemoryArtifactLoader({
      routePointers: [
        {
          tenantId: "tenant-acme",
          locale: "en-US",
          path: "/contact",
          artifactKey: "artifact-contact-v2",
        },
      ],
      artifacts: [],
    });

    const adapter = createDeliveryAdapter({ tenants, loader });
    const response = await adapter.fetch(new Request("https://acme.local/site/contact"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "PUBLISHED_ARTIFACT_MISSING",
      artifactKey: "artifact-contact-v2",
    });
  });
});
