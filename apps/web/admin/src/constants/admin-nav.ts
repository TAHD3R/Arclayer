import type { LucideIcon } from "lucide-react";
import { Bug, CornerDownRight, Gauge, Layers, List } from "lucide-react";

export type AdminNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  icon: LucideIcon;
  children?: AdminNavItem[];
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    labelKey: "common:NAV_DASHBOARD",
    to: "/",
    icon: Gauge,
  },
  {
    key: "test",
    label: "Test",
    labelKey: "common:NAV_TEST",
    icon: Bug,
    children: [
      {
        key: "test.index",
        label: "Overview",
        labelKey: "common:NAV_TEST_OVERVIEW",
        to: "/test",
        icon: List,
      },
      {
        key: "test.level2",
        label: "Level 2",
        labelKey: "common:NAV_TEST_LEVEL2",
        to: "/test/level-2",
        icon: Layers,
        children: [
          {
            key: "test.level2.level3",
            label: "Level 3",
            labelKey: "common:NAV_TEST_LEVEL3",
            to: "/test/level-2/level-3",
            icon: CornerDownRight,
          },
        ],
      },
    ],
  },
] as const;
