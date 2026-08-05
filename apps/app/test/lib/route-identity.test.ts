import { describe, expect, test } from "vitest";

import { isGlobalPath } from "@/lib/routing/route-identity";

describe("route identity", () => {
  test("uses shared global scene routes for inspiration without capturing project details", () => {
    expect(isGlobalPath("/inspriation")).toBe(true);
    expect(isGlobalPath("/inspriation/landing")).toBe(true);
    expect(isGlobalPath("/projects")).toBe(true);
    expect(isGlobalPath("/projects/project-alpha")).toBe(false);
  });
});
