import { afterEach, describe, expect, it, vi } from "vitest";

import { getProductApplicationUrl } from "@/lib/origins";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cross-application origin contract", () => {
  it("builds the typed Product home target without authority-bearing state", () => {
    vi.stubEnv("VITE_PRODUCT_APP_ORIGIN", "https://app.arclayer.example");
    expect(getProductApplicationUrl("home")).toBe("https://app.arclayer.example/");
  });

  it("rejects configured origins that carry credentials or path state", () => {
    vi.stubEnv("VITE_PRODUCT_APP_ORIGIN", "https://user@example.test/workspace?id=secret");
    expect(() => getProductApplicationUrl("home")).toThrow(
      "must not contain credentials or a path",
    );
  });
});
