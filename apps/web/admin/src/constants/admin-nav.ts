import type { LucideIcon } from "lucide-react";
import {
  Activity,
  File,
  FileText,
  Gauge,
  HardDrive,
  History,
  Images,
  LibraryBig,
  Navigation2,
  Package,
  Paintbrush,
  Palette,
  Settings,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  UserPlus,
  Wrench,
} from "lucide-react";

export type AdminNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  icon: LucideIcon;
  children?: AdminNavItem[];
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
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
        key: "content.library",
        label: "Content library",
        labelKey: "nav:NAV_CONTENT_LIBRARY",
        to: "/content/library",
        icon: LibraryBig,
      },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    labelKey: "nav:NAV_ASSETS",
    to: "/assets",
    icon: Images,
  },
  {
    key: "appearance",
    label: "Appearance",
    labelKey: "nav:NAV_APPEARANCE",
    icon: Palette,
    children: [
      {
        key: "appearance.themes",
        label: "Themes",
        labelKey: "nav:NAV_APPEARANCE_THEMES",
        to: "/appearance/themes",
        icon: Paintbrush,
      },
      {
        key: "appearance.navigation",
        label: "Navigation",
        labelKey: "nav:NAV_APPEARANCE_NAVIGATION",
        to: "/appearance/navigation",
        icon: Navigation2,
      },
      {
        key: "appearance.styles",
        label: "Global styles",
        labelKey: "nav:NAV_APPEARANCE_STYLES",
        to: "/appearance/styles",
        icon: Palette,
      },
    ],
  },
  {
    key: "plugins",
    label: "Plugins",
    labelKey: "nav:NAV_PLUGINS",
    icon: Package,
    children: [
      {
        key: "plugins.installed",
        label: "Installed",
        labelKey: "nav:NAV_PLUGINS_INSTALLED",
        to: "/plugins/installed",
        icon: Package,
      },
    ],
  },
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
        key: "settings.general",
        label: "General",
        labelKey: "nav:NAV_SETTINGS_GENERAL",
        to: "/settings/general",
        icon: SlidersHorizontal,
      },
      {
        key: "settings.seo",
        label: "SEO",
        labelKey: "nav:NAV_SETTINGS_SEO",
        to: "/settings/seo",
        icon: Search,
      },
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
            to: "/settings/team/roles",
            icon: ShieldCheck,
          },
        ],
      },
      {
        key: "settings.maintenance",
        label: "Maintenance",
        labelKey: "nav:NAV_SETTINGS_MAINTENANCE",
        icon: Wrench,
        children: [
          {
            key: "settings.maintenance.snapshots",
            label: "Backups & rollback",
            labelKey: "nav:NAV_SETTINGS_MAINTENANCE_SNAPSHOTS",
            to: "/settings/maintenance/snapshots",
            icon: HardDrive,
          },
          {
            key: "settings.maintenance.auditLog",
            label: "Audit log",
            labelKey: "nav:NAV_SETTINGS_MAINTENANCE_AUDIT_LOG",
            to: "/settings/maintenance/audit-log",
            icon: History,
          },
          {
            key: "settings.maintenance.status",
            label: "System status",
            labelKey: "nav:NAV_SETTINGS_MAINTENANCE_STATUS",
            to: "/settings/maintenance/status",
            icon: Activity,
          },
        ],
      },
    ],
  },
] as const;
