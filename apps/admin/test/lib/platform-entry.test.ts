import { describe, expect, it } from "vitest";

import { parsePlatformOrigin } from "@/lib/platform-entry";

describe("parsePlatformOrigin", () => {
  it("accepts only an absolute HTTP(S) origin", () => {
    expect(parsePlatformOrigin("https://platform.arclayer.localhost")).toBe(
      "https://platform.arclayer.localhost",
    );
    expect(parsePlatformOrigin("http://localhost:4173/")).toBe("http://localhost:4173");
  });

  it.each([
    undefined,
    "platform.arclayer.localhost",
    "ftp://platform.arclayer.localhost",
    "https://user:pass@platform.arclayer.localhost",
    "https://platform.arclayer.localhost/console",
    "https://platform.arclayer.localhost?workspace=1",
    "https://platform.arclayer.localhost#entry",
  ])("rejects invalid or contextual Platform URLs: %s", (value) => {
    expect(() => parsePlatformOrigin(value)).toThrow();
  });
});
