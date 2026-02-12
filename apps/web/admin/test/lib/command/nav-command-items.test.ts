import { History, Search, Settings } from "lucide-react";
import { describe, expect, test, vi } from "vitest";

import type { AdminNavItem } from "@/constants/admin-nav";
import { buildAdminNavCommandItems } from "@/lib/command/nav-command-items";

describe("nav-command-items", () => {
  test("builds command entries from nested nav items and prefers labelKey translation", () => {
    const navigate = vi.fn();
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

    const items = buildAdminNavCommandItems(navItems, t, navigate);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "route:/",
      title: "translated:nav:NAV_DASHBOARD",
      description: "/",
      to: "/",
    });
    expect(items[1]).toMatchObject({
      id: "route:/settings/search",
      title: "translated:nav:NAV_SEARCH",
      description: "/settings/search",
      to: "/settings/search",
    });

    items[1]?.onSelect?.();
    expect(navigate).toHaveBeenCalledWith("/settings/search");
  });

  test("skips disabled and non-routable nodes", () => {
    const navigate = vi.fn();
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

    const items = buildAdminNavCommandItems(navItems, t, navigate);
    expect(items).toEqual([]);
  });

  test("deduplicates by route path", () => {
    const navigate = vi.fn();
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

    const items = buildAdminNavCommandItems(navItems, t, navigate);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("A");
  });
});
