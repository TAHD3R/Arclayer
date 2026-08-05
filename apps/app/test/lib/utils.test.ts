import { describe, expect, it } from "vitest";

import { cn } from "@arclayer/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });
});
