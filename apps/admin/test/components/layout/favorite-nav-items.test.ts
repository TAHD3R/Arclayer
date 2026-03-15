import { Activity, Home, UserPlus, Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { resolveFavoriteNavItems } from "@/components/layout/admin-side-nav/favorite-nav-items";
import type { AdminNavItem, AdminNavSection } from "@/types/admin-nav";

const homeItem: AdminNavItem = {
  key: "dashboard",
  label: "Dashboard",
  icon: Home,
  to: "/w/ws-1/",
};

const sections: AdminNavSection[] = [
  {
    key: "general",
    title: "General",
    items: [
      {
        key: "activity",
        label: "Activity",
        icon: Activity,
        to: "/w/ws-1/activity",
      },
    ],
  },
  {
    key: "collaboration",
    title: "Collaboration",
    items: [
      {
        key: "team",
        label: "Team",
        icon: Users,
        children: [
          {
            key: "team.invitations",
            label: "Invitations",
            icon: UserPlus,
            to: "/w/ws-1/team/invitations",
          },
        ],
      },
    ],
  },
];

describe("resolveFavoriteNavItems", () => {
  it("prioritizes current workspace favorites before other workspace favorites", () => {
    const favorites = resolveFavoriteNavItems({
      favoritePaths: ["/w/ws-2/team/invitations", "/w/ws-1/activity", "/w/ws-3/unknown"],
      homeItem,
      sections,
      workspaceBase: "/w/ws-1",
      t: ((key: string) => key) as TFunction,
    });

    expect(favorites).toEqual([
      expect.objectContaining({
        path: "/w/ws-1/activity",
        label: "Activity",
        isCurrentWorkspace: true,
      }),
      expect.objectContaining({
        path: "/w/ws-2/team/invitations",
        label: "Invitations",
        isCurrentWorkspace: false,
      }),
    ]);
  });
});
