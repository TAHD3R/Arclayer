import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { requireTrustedNavigationDestination } from "@/capabilities/module-registry";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("Platform extension connections", () => {
  it("uses the generated Platform SDK operation without a raw request path", async () => {
    const api = await source("apps/platform/src/extensions/extensions-api.ts");

    expect(api).toContain('from "@arclayer/platform-openapi"');
    expect(api).toContain("platformListExtensionConnections");
    expect(api).not.toContain("fetch(");
    expect(api).not.toContain("/system/settings");
  });

  it("registers a canonical Connections route and trusted destination", async () => {
    const route = await source(
      "apps/platform/src/routes/_authenticated/extensions/connections.tsx",
    );
    const destination = requireTrustedNavigationDestination("extensions.connections");

    expect(route).toContain('createFileRoute("/_authenticated/extensions/connections")');
    expect(destination.path).toBe("/extensions/connections");
    expect(destination.labelKey).toBe("navigation:EXTENSIONS_CONNECTIONS");
  });

  it("links each connector to its typed owning domain and exposes real UI states", async () => {
    const page = await source("apps/platform/src/pages/extensions.tsx");

    expect(page).toContain("listExtensionConnections()");
    expect(page).toContain("requireTrustedNavigationDestination(");
    expect(page).toContain("item.configurationTarget");
    expect(page).toContain('state.status === "loading"');
    expect(page).toContain('state.status === "error"');
    expect(page).toContain("empty(state.data)");
    expect(page).toContain('item.runtimeReady ? "RUNTIME_READY" : "RUNTIME_NOT_READY"');
    expect(page).toContain("to={destination.path}");
  });

  it("provides natural bilingual copy for configuration ownership and readiness", async () => {
    const [english, chinese] = await Promise.all([
      source("apps/platform/locales/en-US/extensions.json"),
      source("apps/platform/locales/zh-CN/extensions.json"),
    ]);

    expect(english).toContain('"CONFIGURATION_CHECK_OWNING_DOMAIN": "Check in the owning domain"');
    expect(english).toContain('"RUNTIME_READY": "Available"');
    expect(chinese).toContain(
      '"CONFIGURATION_CHECK_OWNING_DOMAIN": "请在负责该能力的功能区中查看"',
    );
    expect(chinese).toContain('"RUNTIME_READY": "可用"');
  });
});
