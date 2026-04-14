import { describe, expect, test } from "vitest";

import { GLOBAL_NAV_ITEMS, resolveGlobalNavItems } from "@/constants/menu/global";

describe("global nav regression", () => {
  test("registers recents as a non-routable global sidebar capability", () => {
    const recentsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.recents");

    expect(recentsItem).toMatchObject({
      key: "global.recents",
      label: "Recents",
    });
    expect(recentsItem?.to).toBeUndefined();
  });

  test("registers system settings as a real global destination", () => {
    const settingsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.system");

    expect(settingsItem).toMatchObject({
      key: "global.system",
      label: "System Settings",
      to: "/system",
    });
  });

  test("only exposes system settings to super admins", () => {
    expect(resolveGlobalNavItems({ isSuperAdmin: false }).map((item) => item.key)).not.toContain(
      "global.system",
    );
    expect(resolveGlobalNavItems({ isSuperAdmin: true }).map((item) => item.key)).toContain(
      "global.system",
    );
  });
});
