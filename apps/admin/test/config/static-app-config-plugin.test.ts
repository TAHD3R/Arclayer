import { describe, expect, it } from "vitest";

import { staticAppConfig } from "@arclayer/vite-plugin";

function callHook<TArgs extends unknown[], TResult>(
  hook: unknown,
  ...args: TArgs
): TResult | undefined {
  if (!hook) return undefined;
  if (typeof hook === "function") return (hook as (...hookArgs: TArgs) => TResult)(...args);
  if (typeof hook === "object" && hook !== null && "handler" in hook) {
    const handler = (hook as { handler: (...hookArgs: TArgs) => TResult }).handler;
    return handler(...args);
  }
  return undefined;
}

function callIndexHtmlHook(plugin: { transformIndexHtml?: unknown }, html: string): unknown {
  const hook = plugin.transformIndexHtml;
  if (!hook) return undefined;
  if (typeof hook === "function")
    return (hook as (input: string, ctx?: unknown) => unknown)(html, undefined);
  if (typeof hook === "object" && hook !== null && "handler" in hook) {
    const handler = (hook as { handler: (input: string, ctx?: unknown) => unknown }).handler;
    return handler(html, undefined);
  }
  return undefined;
}

describe("staticAppConfig", () => {
  it("exposes a virtual module with the exact app config", async () => {
    const plugin = staticAppConfig({
      config: {
        title: "Workspace Preview",
        apiBaseUrl: "",
        apiPrefix: "/api/v1",
      },
    });

    const resolvedId = callHook(plugin.resolveId, "virtual:arclayer-app-config", undefined, {
      attributes: {},
      isEntry: false,
    });
    expect(resolvedId).toBe("\0virtual:arclayer-app-config");

    const code = await callHook(plugin.load, String(resolvedId), undefined);
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

    const html = callIndexHtmlHook(
      plugin,
      `
      <html>
        <head>
          <meta name="description" content="Arclayer Admin" />
          <title>Arclayer</title>
        </head>
      </html>
    `,
    );

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

    const html = callIndexHtmlHook(
      plugin,
      '<meta name="description" content="Arclayer Admin" /><title>Arclayer</title>',
    );

    expect(String(html)).toContain("Arc &lt;Admin&gt; &amp; &quot;Ops&quot;");
  });
});
