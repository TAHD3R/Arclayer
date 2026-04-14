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
    const maintenanceItem = GLOBAL_NAV_ITEMS.find(
      (item) => item.key === "global.maintenance",
    );
    const settingsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.system");

    expect(maintenanceItem).toMatchObject({
      key: "global.maintenance",
      label: "Maintenance",
    });
    expect(settingsItem).toMatchObject({
      key: "global.system",
      label: "System Settings",
      to: "/system",
    });
  });

  test("only exposes system settings to super admins", () => {
    const regularKeys = resolveGlobalNavItems({ isSuperAdmin: false }).map((item) => item.key);
    const superAdminItems = resolveGlobalNavItems({ isSuperAdmin: true });
    const maintenanceItem = superAdminItems.find((item) => item.key === "global.maintenance");

    expect(regularKeys).not.toContain("global.maintenance");
    expect(maintenanceItem?.children?.map((item) => item.key)).toContain("global.system");
  });
});
