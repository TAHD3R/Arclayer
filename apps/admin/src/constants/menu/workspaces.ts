import {
  Activity,
  Database,
  File,
  Gauge,
  Globe,
  HardDrive,
  History,
  Image,
  Languages,
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
    key: "general",
    title: "General",
    titleKey: "nav:NAV_SECTION_GENERAL",
    items: [
      {
        key: "assets",
        label: "Assets",
        labelKey: "nav:NAV_ASSETS",
        to: "/assets",
        icon: Image,
      },
      {
        key: "activity",
        label: "Activity",
        labelKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
        to: "/settings/maintenance/activity",
        icon: History,
      },
    ],
  },
  {
    key: "content",
    title: "Content",
    titleKey: "nav:NAV_SECTION_CONTENT",
    items: [
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
    key: "collaboration",
    title: "Collaboration",
    titleKey: "nav:NAV_SECTION_COLLABORATION",
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
        label: "Member invitations",
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
    key: "configuration",
    title: "Configuration",
    titleKey: "nav:NAV_SECTION_CONFIGURATION",
    items: [
      {
        key: "settings.workspace",
        label: "Workspace",
        labelKey: "nav:NAV_SETTINGS_WORKSPACE",
        to: "/settings/workspace",
        icon: Navigation2,
      },
      {
        key: "settings.siteIdentity",
        label: "Site identity",
        labelKey: "nav:NAV_SETTINGS_GENERAL",
        to: "/settings/general/site",
        icon: Globe,
      },
      {
        key: "settings.siteLocalization",
        label: "Localization",
        labelKey: "nav:NAV_SETTINGS_LOCALIZATION",
        to: "/settings/general/localization",
        icon: Languages,
      },
      {
        key: "settings.seo",
        label: "SEO",
        labelKey: "nav:NAV_SETTINGS_SEO",
        to: "/settings/seo",
        icon: Search,
      },
      {
        key: "settings.snapshots",
        label: "Backups & rollback",
        labelKey: "nav:NAV_SETTINGS_MAINTENANCE_SNAPSHOTS",
        to: "/settings/maintenance/snapshots",
        icon: HardDrive,
        scope: "self_host",
      },
      {
        key: "settings.status",
        label: "System status",
        labelKey: "nav:NAV_SETTINGS_MAINTENANCE_STATUS",
        to: "/settings/maintenance/status",
        icon: Activity,
        scope: "self_host",
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  WORKSPACE_NAV_HOME_ITEM,
  ...flattenWorkspaceNavSections(WORKSPACE_NAV_SECTIONS),
] as const;
