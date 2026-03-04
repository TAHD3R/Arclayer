import {
  Activity,
  Blocks,
  Database,
  File,
  FileText,
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
  Settings,
  ShieldCheck,
  Users,
  UserPlus,
} from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";
export type { AdminNavItem } from "@/types/admin-nav";

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  // ── Group 1: Core content ──
  {
    key: "dashboard",
    label: "Dashboard",
    labelKey: "nav:NAV_DASHBOARD",
    to: "/",
    icon: Gauge,
  },
  {
    key: "content",
    label: "Content",
    labelKey: "nav:NAV_CONTENT",
    icon: FileText,
    children: [
      {
        key: "content.pages",
        label: "Pages",
        labelKey: "nav:NAV_CONTENT_PAGES",
        to: "/content/pages",
        icon: File,
      },
      {
        key: "content.all",
        label: "All content",
        labelKey: "nav:NAV_CONTENT_ALL",
        to: "/content/entries",
        icon: List,
        disabled: true,
      },
      {
        key: "content.types",
        label: "Content types",
        labelKey: "nav:NAV_CONTENT_TYPES",
        to: "/content/types",
        icon: Database,
        disabled: true,
      },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    labelKey: "nav:NAV_ASSETS",
    to: "/assets",
    icon: Image,
  },
  // ── Group 2: Ecosystem & collaboration ──
  {
    key: "settings.team",
    label: "Team",
    labelKey: "nav:NAV_SETTINGS_TEAM",
    icon: Users,

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
    ],
  },
  {
    key: "activity",
    label: "Activity",
    labelKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
    to: "/settings/maintenance/activity",
    icon: History,
  },
  {
    key: "extensionsIntegrations",
    label: "Extensions & integrations",
    labelKey: "nav:NAV_EXTENSIONS_INTEGRATIONS",
    icon: Blocks,
    children: [
      {
        key: "extensionsIntegrations.extensions",
        label: "Extensions",
        labelKey: "nav:NAV_EXTENSIONS",
        to: "/extensions",
        icon: Puzzle,
      },
    ],
  },
  // ── Group 3: Configuration ──
  {
    key: "settings",
    label: "Settings",
    labelKey: "nav:NAV_SETTINGS",
    icon: Settings,
    children: [
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
] as const;
