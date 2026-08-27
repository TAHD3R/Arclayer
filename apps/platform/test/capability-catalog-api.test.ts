import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { platformListPlatformCapabilities } from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPlatformCapabilityCatalog,
  PlatformCapabilityCatalogApiError,
} from "@/capabilities/catalog-api";
import { platformApiClient } from "@/api/client";

vi.mock("@arclayer/platform-openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/platform-openapi")>();
  return { ...actual, platformListPlatformCapabilities: vi.fn() };
});
vi.unmock("@/capabilities/catalog-api");

describe("Platform capability Catalog API", () => {
  beforeEach(() => {
    vi.mocked(platformListPlatformCapabilities).mockReset();
  });

  it("exposes the rollout preview and apply flow through the generated SDK", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
    const source = await readFile(path.join(root, "capabilities/catalog-api.ts"), "utf8");

    expect(source).toContain("platformPreviewWorkspaceCapabilityRollout");
    expect(source).toContain("platformApplyWorkspaceCapabilityRollout");
    expect(source).not.toContain("fetch(");

    const rolloutSheet = await readFile(
      path.join(root, "capabilities/capability-rollout-sheet.tsx"),
      "utf8",
    );
    expect(rolloutSheet).toContain("previewCapabilityRollout");
    expect(rolloutSheet).toContain("applyCapabilityRollout");
    expect(rolloutSheet).toContain("ROLLOUT_REASON_REQUIRED");
    expect(rolloutSheet).toContain("applyAttempt.current?.fingerprint !== fingerprint");
  });

  it("uses the generated Platform SDK and unwraps the canonical envelope", async () => {
    const catalog = { items: [] };
    vi.mocked(platformListPlatformCapabilities).mockResolvedValue({
      data: { data: catalog, message: "OK", timestamp: 1 },
      request: new Request("https://platform.test/platform-api/v1/capabilities"),
      response: new Response(null, { status: 200 }),
    });

    await expect(getPlatformCapabilityCatalog()).resolves.toEqual(catalog);
    expect(platformListPlatformCapabilities).toHaveBeenCalledWith({ client: platformApiClient });
  });

  it("surfaces a stable error instead of substituting static capabilities", async () => {
    vi.mocked(platformListPlatformCapabilities).mockResolvedValue({
      data: undefined,
      error: { error: "PLATFORM_PERMISSION_DENIED" },
      request: new Request("https://platform.test/platform-api/v1/capabilities"),
      response: new Response(null, { status: 403 }),
    });

    await expect(getPlatformCapabilityCatalog()).rejects.toEqual(
      expect.objectContaining<Partial<PlatformCapabilityCatalogApiError>>({
        code: "PLATFORM_PERMISSION_DENIED",
        status: 403,
      }),
    );
  });
});
