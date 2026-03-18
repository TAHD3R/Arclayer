import {
  Globe,
  History,
  Images,
  LayoutDashboard,
  LibraryBig,
  MailPlus,
  Puzzle,
  Search,
  Settings2,
  Shield,
  Users,
} from "lucide-react";

import type { AdminNavItem, AdminNavSection } from "@/types/admin-nav";
export type { AdminNavItem, AdminNavSection } from "@/types/admin-nav";

function flattenWorkspaceNavSections(sections: readonly AdminNavSection[]): AdminNavItem[] {
  return sections.flatMap((section) => section.items);
}

export const WORKSPACE_NAV_HOME_ITEM: AdminNavItem = {
  key: "dashboard",
  label: "Dashboard",
  labelKey: "nav:NAV_DASHBOARD",
  to: "/",
  icon: LayoutDashboard,
};

export const WORKSPACE_NAV_SECTIONS: AdminNavSection[] = [
  {
    key: "content",
    title: "Content",
    titleKey: "nav:NAV_SECTION_CONTENT",
    items: [
      {
        key: "assets",
        label: "Assets",
        labelKey: "nav:NAV_ASSETS",
        to: "/assets",
        icon: Images,
      },
      {
        key: "content.library",
        label: "Contents",
        labelKey: "nav:NAV_CONTENT_LIBRARY",
        to: "/content/library",
        icon: LibraryBig,
      },
      {
        key: "settings.seo",
        label: "SEO Analyze",
        labelKey: "nav:NAV_SETTINGS_SEO",
        to: "/settings/seo",
        icon: Search,
      },
      {
        key: "settings.general",
        label: "Site Settings",
        labelKey: "nav:NAV_SETTINGS_SITE",
        to: "/settings/site",
        icon: Globe,
      },
    ],
  },
  {
    key: "team",
    title: "Team",
    titleKey: "nav:NAV_SECTION_TEAM",
    items: [
      {
        key: "settings.team.memberList",
        label: "Members",
        labelKey: "nav:NAV_SETTINGS_TEAM_MEMBER_LIST",
        to: "/team/members",
        icon: Users,
      },
      {
        key: "settings.team.members",
        label: "Invitations",
        labelKey: "nav:NAV_SETTINGS_TEAM_MEMBERS",
        to: "/team/invitations",
        icon: MailPlus,
      },
      {
        key: "settings.team.roles",
        label: "Permissions",
        labelKey: "nav:NAV_SETTINGS_TEAM_ROLES",
        to: "/team/roles",
        icon: Shield,
      },
    ],
  },
  {
    key: "workspace",
    title: "Workspace",
    titleKey: "nav:NAV_SECTION_WORKSPACE",
    items: [
      {
        key: "extensions",
        label: "Extensions",
        labelKey: "nav:NAV_EXTENSIONS",
        to: "/extensions",
        icon: Puzzle,
      },
      {
        key: "settings.workspace",
        label: "Workspace Settings",
        labelKey: "nav:NAV_SETTINGS_WORKSPACE",
        to: "/settings/workspace",
        icon: Settings2,
      },
    ],
  },
  {
    key: "maintenance",
    title: "Maintenance",
    titleKey: "nav:NAV_SECTION_MAINTENANCE",
    items: [
      {
        key: "activity",
        label: "Activity",
        labelKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
        to: "/settings/maintenance/activity",
        icon: History,
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  WORKSPACE_NAV_HOME_ITEM,
  ...flattenWorkspaceNavSections(WORKSPACE_NAV_SECTIONS),
] as const;
