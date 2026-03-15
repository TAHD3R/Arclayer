import { History, Search, Settings } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import type { AdminNavItem } from "@/types/admin-nav";
import { buildAdminNavCommandEntries } from "@/lib/command/nav-command-items";

describe("nav-command-items", () => {
  test("builds command entries from nested nav items and prefers labelKey translation", () => {
    const t = vi.fn((key: string) => `translated:${key}`);

    const navItems: AdminNavItem[] = [
      {
        key: "dashboard",
        label: "Dashboard",
        labelKey: "nav:NAV_DASHBOARD",
        to: "/",
        icon: History,
      },
      {
        key: "settings",
        label: "Settings",
        icon: Settings,
        children: [
          {
            key: "settings.search",
            label: "Search",
            labelKey: "nav:NAV_SEARCH",
            to: "/settings/search",
            icon: Search,
          },
        ],
      },
    ];

    const items = buildAdminNavCommandEntries(navItems, t);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "page:/",
      key: "page:/",
      kind: "page",
      title: "translated:nav:NAV_DASHBOARD",
      subtitle: "/",
      action: { type: "navigate", to: "/" },
    });
    expect(items[1]).toMatchObject({
      id: "page:/settings/search",
      key: "page:/settings/search",
      kind: "page",
      title: "translated:nav:NAV_SEARCH",
      subtitle: "/settings/search",
      action: { type: "navigate", to: "/settings/search" },
    });
  });

  test("skips disabled and non-routable nodes", () => {
    const t = vi.fn((key: string) => key);

    const navItems: AdminNavItem[] = [
      {
        key: "root",
        label: "Root",
        icon: Settings,
        children: [
          {
            key: "disabled",
            label: "Disabled",
            to: "/disabled",
            disabled: true,
            icon: Search,
          },
          {
            key: "group",
            label: "Group",
            icon: History,
          },
        ],
      },
    ];

    const items = buildAdminNavCommandEntries(navItems, t);
    expect(items).toEqual([]);
  });

  test("deduplicates by route path", () => {
    const t = vi.fn((key: string) => key);

    const navItems: AdminNavItem[] = [
      {
        key: "a",
        label: "A",
        to: "/same",
        icon: Settings,
      },
      {
        key: "b",
        label: "B",
        to: "/same",
        icon: Search,
      },
    ];

    const items = buildAdminNavCommandEntries(navItems, t);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("A");
  });
});
