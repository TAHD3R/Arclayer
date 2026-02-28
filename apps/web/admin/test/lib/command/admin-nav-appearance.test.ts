import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS } from "@/constants/menu/workspaces";

describe("admin nav appearance group", () => {
  test("appearance group has been removed", () => {
    const appearanceGroup = ADMIN_NAV_ITEMS.find((item) => item.key === "appearance");
    expect(appearanceGroup).toBeUndefined();
  });
});
