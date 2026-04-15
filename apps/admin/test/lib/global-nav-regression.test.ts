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
    const maintenanceItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.maintenance");
    const settingsItem = maintenanceItem?.children?.find((item) => item.key === "global.system");

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

  test("marks workspaces as a navigate-self-and-expand group", () => {
    const workspacesItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.workspaces");

    expect(workspacesItem).toMatchObject({
      key: "global.workspaces",
      to: "/workspaces",
      groupBehavior: "navigate-self-and-expand",
    });
  });

  test("injects runtime workspace children under the global workspaces node", () => {
    const injectedItems = resolveGlobalNavItems({
      isSuperAdmin: false,
      workspaceChildren: [
        {
          key: "global.workspaces.ws-alpha",
          label: "Alpha",
          to: "/w/ws-alpha",
          icon: GLOBAL_NAV_ITEMS[2]!.icon,
        },
      ],
    });
    const workspacesItem = injectedItems.find((item) => item.key === "global.workspaces");

    expect(workspacesItem?.children).toHaveLength(1);
    expect(workspacesItem?.children?.[0]).toMatchObject({
      key: "global.workspaces.ws-alpha",
      label: "Alpha",
      to: "/w/ws-alpha",
    });
  });
});
