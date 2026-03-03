import { describe, expect, it } from "vitest";

import { cn } from "@celestial/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });
});
