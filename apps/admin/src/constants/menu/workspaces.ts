import {
  Database,
  File,
  Gauge,
  Globe,
  History,
  Image,
  List,
  Navigation2,
  Puzzle,
  Search,
  ShieldCheck,
  Users,
  UserPlus,
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
  icon: Gauge,
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
        icon: Image,
      },
      {
        key: "content.siteBuilder",
        label: "Site Builder",
        labelKey: "nav:NAV_CONTENT_SITE_BUILDER",
        to: "/content/site-builder",
        icon: File,
      },
      {
        key: "content.library",
        label: "Content Library",
        labelKey: "nav:NAV_CONTENT_LIBRARY",
        to: "/content/library",
        icon: List,
      },
      {
        key: "content.models",
        label: "Models",
        labelKey: "nav:NAV_CONTENT_MODELS",
        to: "/content/models",
        icon: Database,
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
        icon: UserPlus,
      },
      {
        key: "settings.team.roles",
        label: "Roles & permissions",
        labelKey: "nav:NAV_SETTINGS_TEAM_ROLES",
        to: "/team/roles",
        icon: ShieldCheck,
      },
    ],
  },
  {
    key: "workspace",
    title: "Workspace",
    titleKey: "nav:NAV_SECTION_WORKSPACE",
    items: [
      {
        key: "activity",
        label: "Activity",
        labelKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
        to: "/settings/maintenance/activity",
        icon: History,
      },
      {
        key: "extensions",
        label: "Extensions",
        labelKey: "nav:NAV_EXTENSIONS",
        to: "/extensions",
        icon: Puzzle,
      },
    ],
  },
  {
    key: "settings",
    title: "Settings",
    titleKey: "nav:NAV_SECTION_SETTINGS",
    items: [
      {
        key: "settings.workspace",
        label: "Workspace",
        labelKey: "nav:NAV_SETTINGS_WORKSPACE",
        to: "/settings/workspace",
        icon: Navigation2,
      },
      {
        key: "settings.general",
        label: "Site",
        labelKey: "nav:NAV_SETTINGS_SITE",
        to: "/settings/site/basics",
        icon: Globe,
      },
      {
        key: "settings.seo",
        label: "SEO",
        labelKey: "nav:NAV_SETTINGS_SEO",
        to: "/settings/seo",
        icon: Search,
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  WORKSPACE_NAV_HOME_ITEM,
  ...flattenWorkspaceNavSections(WORKSPACE_NAV_SECTIONS),
] as const;
