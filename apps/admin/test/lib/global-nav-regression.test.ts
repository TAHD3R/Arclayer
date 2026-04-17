import { describe, expect, test } from "vitest";

import { GLOBAL_NAV_ITEMS, resolveGlobalNavItems } from "@/constants/menu/global";

describe("global nav regression", () => {
  test("registers billing and platform global groups", () => {
    const billingItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.billing");
    const platformItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.platform");
    const billingChildren = billingItem?.children?.map((item) => item.key);
    const platformChildren = platformItem?.children?.map((item) => item.key);
    const configurationItem = platformItem?.children?.find(
      (item) => item.key === "global.platform.configuration",
    );

    expect(billingItem).toMatchObject({
      key: "global.billing",
      label: "Billing & Subscription",
    });
    expect(platformItem).toMatchObject({
      key: "global.platform",
      label: "Platform",
    });
    expect(billingChildren).toEqual(["global.billing.subscriptions", "global.billing.history"]);
    expect(platformChildren).toEqual([
      "global.platform.tenants",
      "global.platform.plans",
      "global.platform.access",
      "global.platform.audit",
      "global.platform.overview",
      "global.platform.jobs",
      "global.platform.configuration",
      "global.platform.revenue",
      "global.platform.support",
    ]);
    expect(configurationItem).toMatchObject({
      key: "global.platform.configuration",
      to: "/system",
    });
    expect(configurationItem?.disabled).toBeUndefined();
  });

  test("only exposes platform to super admins while keeping billing visible", () => {
    const regularKeys = resolveGlobalNavItems({ isSuperAdmin: false }).map((item) => item.key);
    const superAdminItems = resolveGlobalNavItems({ isSuperAdmin: true });
    const superAdminKeys = superAdminItems.map((item) => item.key);
    const platformItem = superAdminItems.find((item) => item.key === "global.platform");
    const billingItem = superAdminItems.find((item) => item.key === "global.billing");

    expect(regularKeys).toContain("global.billing");
    expect(regularKeys).not.toContain("global.platform");
    expect(superAdminKeys).toContain("global.billing");
    expect(superAdminKeys).toContain("global.platform");
    expect(billingItem?.children?.map((item) => item.key)).toContain(
      "global.billing.subscriptions",
    );
    expect(platformItem?.children?.map((item) => item.key)).toContain("global.platform.overview");
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
    const workspacesItemTemplate = GLOBAL_NAV_ITEMS.find(
      (item) => item.key === "global.workspaces",
    );

    const injectedItems = resolveGlobalNavItems({
      isSuperAdmin: false,
      workspaceChildren: [
        {
          key: "global.workspaces.ws-alpha",
          label: "Alpha",
          to: "/w/ws-alpha",
          icon: workspacesItemTemplate!.icon,
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
