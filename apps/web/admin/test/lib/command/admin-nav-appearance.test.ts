import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS } from "@/constants/admin-nav";

describe("admin nav appearance group", () => {
  test("does not expose standalone navigation item", () => {
    const appearanceGroup = ADMIN_NAV_ITEMS.find((item) => item.key === "appearance");
    const childKeys = appearanceGroup?.children?.map((item) => item.key) ?? [];

    expect(childKeys).toContain("appearance.themes");
    expect(childKeys).toContain("appearance.styles");
    expect(childKeys).not.toContain("appearance.navigation");
  });
});
