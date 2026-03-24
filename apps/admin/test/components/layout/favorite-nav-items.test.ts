import { Activity, Globe, Home, Settings, UserPlus, Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { resolveFavoriteNavItems } from "@/components/layout/admin-side-nav/favorite-nav-items";
import type { AdminNavItem } from "@/types/admin-nav";

const items: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    icon: Home,
    to: "/w/ws-1/",
  },
  {
    key: "activity-group",
    label: "General",
    icon: Activity,
    children: [
      {
        key: "activity",
        label: "Activity",
        icon: Activity,
        to: "/w/ws-1/activity",
      },
    ],
  },
  {
    key: "team-group",
    label: "Collaboration",
    icon: Users,
    children: [
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
  {
    key: "content-group",
    label: "Content",
    icon: Activity,
    children: [
      {
        key: "settings.site",
        label: "Site Settings",
        icon: Globe,
        to: "/w/ws-1/settings/site",
      },
    ],
  },
  {
    key: "workspace-group",
    label: "Workspace",
    icon: Settings,
    children: [
      {
        key: "settings.workspace",
        label: "Workspace Settings",
        icon: Settings,
        to: "/w/ws-1/settings/workspace",
      },
    ],
  },
];

describe("resolveFavoriteNavItems", () => {
  it("prioritizes current workspace favorites before other workspace favorites", () => {
    const favorites = resolveFavoriteNavItems({
      favoritePaths: ["/w/ws-2/team/invitations", "/w/ws-1/activity", "/w/ws-3/unknown"],
      items,
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

  it("resolves favorited settings child routes back to their nearest nav entry", () => {
    const favorites = resolveFavoriteNavItems({
      favoritePaths: ["/w/ws-1/settings/site/basics", "/w/ws-1/settings/workspace/basics"],
      items,
      workspaceBase: "/w/ws-1",
      t: ((key: string) => key) as TFunction,
    });

    expect(favorites).toEqual([
      expect.objectContaining({
        path: "/w/ws-1/settings/site/basics",
        label: "Site Settings",
        isCurrentWorkspace: true,
      }),
      expect.objectContaining({
        path: "/w/ws-1/settings/workspace/basics",
        label: "Workspace Settings",
        isCurrentWorkspace: true,
      }),
    ]);
  });
});
