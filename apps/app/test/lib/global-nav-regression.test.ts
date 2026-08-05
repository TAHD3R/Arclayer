import { isValidElement } from "react";
import { Blocks, BookOpenText, Boxes, FolderKanban, House, SwatchBook } from "lucide-react";
import { describe, expect, test } from "vitest";

import {
  GLOBAL_NAV_ITEMS,
  GLOBAL_RECENT_PROJECT_LIMIT,
  resolveGlobalNavItems,
} from "@/constants/menu/global";
import { findActiveTrailNodes } from "@/lib/admin-nav-utils";

describe("global nav regression", () => {
  test("contains only Product Application global entries", () => {
    expect(GLOBAL_NAV_ITEMS).toMatchObject([
      {
        key: "global.home",
        labelKey: "nav:NAV_HOME",
        to: "/",
        icon: House,
      },
      {
        key: "global.resources",
        labelKey: "nav:NAV_RESOURCES",
        to: "/inspriation",
        icon: Boxes,
      },
      {
        key: "global.projects",
        labelKey: "nav:NAV_ALL_PROJECTS",
        to: "/projects",
        icon: FolderKanban,
        insertStarredAfter: true,
      },
      {
        key: "global.customization.knowledge",
        to: "/customization/knowledge",
        icon: BookOpenText,
      },
      {
        key: "global.customization.skills",
        to: "/customization/skills",
        icon: Blocks,
      },
      {
        key: "global.customization.design-systems",
        to: "/customization/design-systems",
        icon: SwatchBook,
      },
    ]);
    expect(GLOBAL_NAV_ITEMS).toHaveLength(6);
  });

  test("adds recent Product projects after the projects entry", () => {
    const items = resolveGlobalNavItems({
      recentProjects: [
        {
          projectId: "project-alpha",
          name: "Project Alpha",
          iconMode: "emoji",
          iconColor: "#123456",
          iconEmoji: "🚀",
        },
        { projectId: "project-beta", name: "Project Beta" },
        { projectId: "project-gamma", name: "Project Gamma" },
        { projectId: "project-delta", name: "Project Delta" },
      ],
    });
    const recentItems = items.filter((item) => item.key.startsWith("global.recent-project."));

    expect(GLOBAL_RECENT_PROJECT_LIMIT).toBe(3);
    expect(recentItems).toHaveLength(GLOBAL_RECENT_PROJECT_LIMIT);
    expect(recentItems[0]).toMatchObject({
      key: "global.recent-project.project-alpha",
      to: "/projects/project-alpha",
      icon: FolderKanban,
      groupLabelBeforeKey: "nav:NAV_SECTION_PROJECTS",
    });
    expect(isValidElement(recentItems[0]?.iconNode)).toBe(true);
  });

  test("recognizes Product global paths", () => {
    expect(findActiveTrailNodes(GLOBAL_NAV_ITEMS, "/projects")).toHaveLength(1);
    expect(findActiveTrailNodes(GLOBAL_NAV_ITEMS, "/customization/skills")).toHaveLength(1);
    expect(findActiveTrailNodes(GLOBAL_NAV_ITEMS, "/unknown")).toHaveLength(0);
  });
});
