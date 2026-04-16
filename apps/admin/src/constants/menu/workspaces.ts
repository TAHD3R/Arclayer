import {
  Boxes,
  Globe,
  History,
  Images,
  LayoutDashboard,
  LibraryBig,
  MailPlus,
  Settings2,
  Shield,
  Users,
} from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

const BASE_WORKSPACE_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    labelKey: "nav:NAV_DASHBOARD",
    to: "/",
    icon: LayoutDashboard,
  },
  {
    key: "assets",
    label: "Assets",
    labelKey: "nav:NAV_ASSETS",
    to: "/assets",
    icon: Images,
    groupLabelBefore: "Website",
    groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
  },
  {
    key: "content.models",
    label: "Content Model",
    labelKey: "nav:NAV_CONTENT_MODELS",
    to: "/content/models",
    icon: Boxes,
  },
  {
    key: "content.library",
    label: "Contents Library",
    labelKey: "nav:NAV_CONTENT_LIBRARY",
    to: "/content/library",
    activeMatchPaths: ["/content/create"],
    icon: LibraryBig,
  },
  // {
  //   key: "settings.seo",
  //   label: "SEO Analyze",
  //   labelKey: "nav:NAV_SETTINGS_SEO",
  //   to: "/settings/seo",
  //   icon: Search,
  // },
  {
    key: "settings.site",
    label: "Site Settings",
    labelKey: "nav:NAV_SETTINGS_SITE",
    to: "/settings/site",
    icon: Globe,
  },
  {
    key: "team",
    label: "Team",
    labelKey: "nav:NAV_SECTION_TEAM",
    icon: Users,
    dividerBefore: true,
    children: [
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
    label: "Workspace",
    labelKey: "nav:NAV_SECTION_WORKSPACE",
    icon: Settings2,
    children: [
      // {
      //   key: "extensions",
      //   label: "Extensions",
      //   labelKey: "nav:NAV_EXTENSIONS",
      //   to: "/extensions",
      //   icon: Puzzle,
      // },
      {
        key: "activity",
        label: "Activity",
        labelKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
        to: "/activity",
        icon: History,
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
] as const;

export function getWorkspaceNavItems(): AdminNavItem[] {
  return BASE_WORKSPACE_NAV_ITEMS;
}

export const WORKSPACE_NAV_ITEMS: AdminNavItem[] = getWorkspaceNavItems();
export const ADMIN_NAV_ITEMS: AdminNavItem[] = WORKSPACE_NAV_ITEMS;
