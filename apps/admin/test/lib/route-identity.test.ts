import { describe, expect, test } from "vitest";

import { isGlobalPath, isSystemPath } from "@/lib/routing/route-identity";

describe("route identity", () => {
  test("treats /system as a global-scene path", () => {
    expect(isSystemPath("/system")).toBe(true);
    expect(isSystemPath("/system/storage")).toBe(true);
    expect(isGlobalPath("/system")).toBe(true);
    expect(isGlobalPath("/system/email")).toBe(true);
  });
});
