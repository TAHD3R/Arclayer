import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("resolvePublicAssetUrlPath", () => {
  test("keeps relative asset paths in dev proxy mode", async () => {
    vi.doMock("@/lib/config/app-config", () => ({
      getAppConfig: () => ({ apiBaseUrl: "" }),
    }));

    const { resolvePublicAssetUrlPath } = await import("@/lib/assets/asset-urls");

    expect(resolvePublicAssetUrlPath("/assets/example/thumb")).toBe("/assets/example/thumb");
  });

  test("joins relative asset paths with apiBaseUrl when configured", async () => {
    vi.doMock("@/lib/config/app-config", () => ({
      getAppConfig: () => ({ apiBaseUrl: "http://api.test" }),
    }));

    const { resolvePublicAssetUrlPath } = await import("@/lib/assets/asset-urls");

    expect(resolvePublicAssetUrlPath("/assets/example/thumb")).toBe(
      "http://api.test/assets/example/thumb",
    );
  });
});
