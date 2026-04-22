import { Activity, Globe, Home, Settings, UserPlus, Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import {
  flattenFavoriteNavItems,
  resolveFavoriteNavItems,
} from "@/components/layout/admin-side-nav/favorite-nav-items";
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

const globalItemsWithWorkspaceChildren: AdminNavItem[] = [
  {
    key: "global.home",
    label: "Home",
    icon: Home,
    to: "/",
  },
  {
    key: "global.projects",
    label: "Projects",
    icon: Users,
    to: "/projects",
    children: [
      {
        key: "global.projects.project-9",
        label: "Philip Cole's Project",
        icon: Home,
        to: "/projects/project-9",
      },
    ],
  },
];

describe("resolveFavoriteNavItems", () => {
  it("preserves the persisted favorites order across workspaces", () => {
    const favorites = resolveFavoriteNavItems({
      favorites: [
        {
          id: "item:/projects/ws-2/settings/general",
          type: "item",
          path: "/projects/ws-2/settings/general",
        },
        { id: "item:/w/ws-1/activity", type: "item", path: "/w/ws-1/activity" },
        { id: "item:/w/ws-3/unknown", type: "item", path: "/w/ws-3/unknown" },
      ],
      items,
      workspaceBase: "/w/ws-1",
      t: ((key: string) => key) as TFunction,
    });

    expect(flattenFavoriteNavItems(favorites)).toEqual([
      expect.objectContaining({
        path: "/projects/ws-2/settings/general",
        label: "nav:NAV_SETTINGS_PROJECT",
        isCurrentWorkspace: false,
      }),
      expect.objectContaining({
        path: "/w/ws-1/activity",
        label: "Activity",
        isCurrentWorkspace: true,
      }),
    ]);
  });

  it("resolves workspace favorites from the global view via workspace templates", () => {
    const favorites = resolveFavoriteNavItems({
      favorites: [
        {
          id: "item:/projects/ws-9/settings/general",
          type: "item",
          path: "/projects/ws-9/settings/general",
        },
        { id: "item:/projects/ws-9/activity", type: "item", path: "/projects/ws-9/activity" },
      ],
      items: [],
      t: ((key: string) => key) as TFunction,
    });

    expect(flattenFavoriteNavItems(favorites)).toEqual([
      expect.objectContaining({
        path: "/projects/ws-9/settings/general",
        label: "nav:NAV_SETTINGS_PROJECT",
        isCurrentWorkspace: false,
      }),
      expect.objectContaining({
        path: "/projects/ws-9/activity",
        label: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
        isCurrentWorkspace: false,
      }),
    ]);
  });

  it("prefers workspace page labels over workspace ancestor labels in the global view", () => {
    const favorites = resolveFavoriteNavItems({
      favorites: [
        { id: "item:/w/ws-9", type: "item", path: "/w/ws-9" },
        {
          id: "item:/w/ws-9/content/library/article-1",
          type: "item",
          path: "/w/ws-9/content/library/article-1",
        },
      ],
      items: globalItemsWithWorkspaceChildren,
      t: ((key: string) => key) as TFunction,
    });

    expect(flattenFavoriteNavItems(favorites)).toEqual([
      expect.objectContaining({
        path: "/w/ws-9",
        label: "nav:NAV_DASHBOARD",
        isCurrentWorkspace: false,
      }),
      expect.objectContaining({
        path: "/w/ws-9/content/library/article-1",
        label: "nav:NAV_CONTENT_LIBRARY",
        isCurrentWorkspace: false,
      }),
    ]);
  });

  it("resolves favorited settings child routes back to their nearest nav entry", () => {
    const favorites = resolveFavoriteNavItems({
      favorites: [
        {
          id: "item:/w/ws-1/settings/site/basics",
          type: "item",
          path: "/w/ws-1/settings/site/basics",
        },
        {
          id: "item:/w/ws-1/settings/workspace/basics",
          type: "item",
          path: "/w/ws-1/settings/workspace/basics",
        },
      ],
      items,
      workspaceBase: "/w/ws-1",
      t: ((key: string) => key) as TFunction,
    });

    expect(flattenFavoriteNavItems(favorites)).toEqual([
      expect.objectContaining({
        path: "/projects/ws-1/content/general",
        label: "nav:NAV_SETTINGS_SITE",
        isCurrentWorkspace: true,
      }),
      expect.objectContaining({
        path: "/w/ws-1/settings/workspace/basics",
        label: "Workspace Settings",
        isCurrentWorkspace: true,
      }),
    ]);
  });

  it("canonicalizes migrated project site settings favorites onto the current content routes", () => {
    const favorites = resolveFavoriteNavItems({
      favorites: [
        {
          id: "item:/projects/ws-9/settings/localization",
          type: "item",
          path: "/projects/ws-9/settings/localization",
        },
        {
          id: "item:/projects/ws-9/settings/domain",
          type: "item",
          path: "/projects/ws-9/settings/domain",
        },
      ],
      items: [],
      t: ((key: string) => key) as TFunction,
    });

    expect(flattenFavoriteNavItems(favorites)).toEqual([
      expect.objectContaining({
        path: "/projects/ws-9/content/localization",
        label: "nav:NAV_SETTINGS_SITE",
      }),
      expect.objectContaining({
        path: "/projects/ws-9/content/domain",
        label: "nav:NAV_SETTINGS_SITE",
      }),
    ]);
  });

  it("preserves folder structure while resolving leaf items", () => {
    const favorites = resolveFavoriteNavItems({
      favorites: [
        {
          id: "folder:launches",
          type: "folder",
          name: "Launches",
          expanded: true,
          children: [{ id: "item:/w/ws-1/activity", type: "item", path: "/w/ws-1/activity" }],
        },
      ],
      items,
      workspaceBase: "/w/ws-1",
      t: ((key: string) => key) as TFunction,
    });

    expect(favorites).toEqual([
      expect.objectContaining({
        type: "folder",
        id: "folder:launches",
        name: "Launches",
        children: [
          expect.objectContaining({
            type: "item",
            path: "/w/ws-1/activity",
            label: "Activity",
          }),
        ],
      }),
    ]);
  });
});
