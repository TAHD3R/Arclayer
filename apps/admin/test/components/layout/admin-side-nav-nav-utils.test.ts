import { Folder, Home, Settings } from "lucide-react";
import { describe, expect, it } from "vitest";

import type { AdminNavItem } from "@/types/admin-nav";
import {
  collectDefaultExpandedGroupKeys,
  findActiveTrail,
  findPreferredGroupTarget,
} from "@/components/layout/admin-side-nav/nav-utils";

function makeItem(key: string, to?: string, children?: AdminNavItem[]): AdminNavItem {
  return {
    key,
    label: key,
    icon: Home,
    ...(to ? { to } : {}),
    ...(children ? { children } : {}),
  };
}

describe("findPreferredGroupTarget", () => {
  it("prefers active descendant route when current path is inside the group", () => {
    const item = makeItem("team", undefined, [
      makeItem("team.members", "/w/ws-1/team/members"),
      makeItem("team.invitations", "/w/ws-1/team/invitations"),
      makeItem("team.roles", "/w/ws-1/team/roles"),
    ]);

    expect(findPreferredGroupTarget(item, new Set(["team", "team.invitations"]))).toBe(
      "/w/ws-1/team/invitations",
    );
  });

  it("falls back to the first enabled descendant when no child is active", () => {
    const item = makeItem("settings", undefined, [
      {
        ...makeItem("settings.workspace", "/w/ws-1/settings/workspace"),
        disabled: true,
        icon: Folder,
      },
      {
        ...makeItem("settings.activity", "/w/ws-1/activity"),
        icon: Settings,
      },
    ]);

    expect(findPreferredGroupTarget(item, new Set(["settings"]))).toBe("/w/ws-1/activity");
  });

  it("returns null when the group has no routable descendants", () => {
    const item = makeItem("group", undefined, [makeItem("placeholder")]);
    expect(findPreferredGroupTarget(item, new Set(["group"]))).toBeNull();
  });
});

describe("findActiveTrail", () => {
  it("prefers the deeper child when a group and child share the exact target", () => {
    const items = [
      makeItem("observability", "/system/observability/overview", [
        makeItem("observability.overview", "/system/observability/overview"),
      ]),
    ];

    expect(findActiveTrail(items, "/system/observability/overview")).toEqual([
      "observability",
      "observability.overview",
    ]);
  });
});

describe("collectDefaultExpandedGroupKeys", () => {
  it("collects every group unless it is explicitly collapsed by default", () => {
    const navItems = [
      makeItem("overview", "/w/ws-1/overview"),
      {
        ...makeItem("content", undefined, [makeItem("content.assets", "/w/ws-1/assets")]),
        defaultExpanded: true,
      },
      {
        ...makeItem("team", undefined, [
          makeItem("team.members", "/w/ws-1/team/members"),
          {
            ...makeItem("team.roles", undefined, [
              makeItem("team.roles.admins", "/w/ws-1/team/roles/admins"),
            ]),
            defaultExpanded: true,
          },
        ]),
      },
      {
        ...makeItem("disabled-by-default", undefined, [
          makeItem("disabled-by-default.child", "/w/ws-1/disabled"),
        ]),
        defaultExpanded: false,
      },
      {
        ...makeItem("leaf-config", "/w/ws-1/leaf-config"),
        defaultExpanded: true,
      },
    ] satisfies AdminNavItem[];

    expect([...collectDefaultExpandedGroupKeys(navItems)]).toEqual([
      "content",
      "team",
      "team.roles",
    ]);
  });
});
