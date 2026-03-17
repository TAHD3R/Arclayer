import { describe, expect, it } from "vitest";

import { staticAppConfig } from "@arclayer/vite-plugin";

describe("staticAppConfig", () => {
  it("exposes a virtual module with the exact app config", async () => {
    const plugin = staticAppConfig({
      config: {
        title: "Workspace Preview",
        apiBaseUrl: "",
        apiPrefix: "/api/v1",
      },
    });

    const resolvedId = plugin.resolveId?.("virtual:arclayer-app-config");
    expect(resolvedId).toBe("\0virtual:arclayer-app-config");

    const code = await plugin.load?.(String(resolvedId));
    expect(String(code)).toContain('"title": "Workspace Preview"');
    expect(String(code)).toContain('"apiBaseUrl": ""');
    expect(String(code)).toContain('"apiPrefix": "/api/v1"');
  });

  it("rewrites title and description in index.html at config time", () => {
    const plugin = staticAppConfig({
      config: {
        title: "Workspace Preview",
        apiBaseUrl: "http://api.test",
        apiPrefix: "/api/v2",
      },
      description: "Workspace Preview Admin",
    });

    const html = plugin.transformIndexHtml?.(`
      <html>
        <head>
          <meta name="description" content="Arclayer Admin" />
          <title>Arclayer</title>
        </head>
      </html>
    `);

    expect(String(html)).toContain("<title>Workspace Preview</title>");
    expect(String(html)).toContain('<meta name="description" content="Workspace Preview Admin" />');
  });

  it("escapes unsafe html characters in head tags", () => {
    const plugin = staticAppConfig({
      config: {
        title: 'Arc <Admin> & "Ops"',
        apiBaseUrl: "",
        apiPrefix: "/api/v1",
      },
    });

    const html = plugin.transformIndexHtml?.(
      '<meta name="description" content="Arclayer Admin" /><title>Arclayer</title>',
    );

    expect(String(html)).toContain("Arc &lt;Admin&gt; &amp; &quot;Ops&quot;");
  });
});
