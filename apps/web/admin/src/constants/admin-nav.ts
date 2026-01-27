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
    labelKey: "common:NAV_DASHBOARD",
    to: "/",
    icon: Gauge,
  },
  {
    key: "content",
    label: "Content",
    labelKey: "common:NAV_CONTENT",
    icon: FileText,
    children: [
      {
        key: "content.pages",
        label: "Pages",
        labelKey: "common:NAV_CONTENT_PAGES",
        to: "/content/pages",
        icon: File,
      },
      {
        key: "content.library",
        label: "Content library",
        labelKey: "common:NAV_CONTENT_LIBRARY",
        to: "/content/library",
        icon: LibraryBig,
      },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    labelKey: "common:NAV_ASSETS",
    to: "/assets",
    icon: Images,
  },
  {
    key: "appearance",
    label: "Appearance",
    labelKey: "common:NAV_APPEARANCE",
    icon: Palette,
    children: [
      {
        key: "appearance.themes",
        label: "Themes",
        labelKey: "common:NAV_APPEARANCE_THEMES",
        to: "/appearance/themes",
        icon: Paintbrush,
      },
      {
        key: "appearance.navigation",
        label: "Navigation",
        labelKey: "common:NAV_APPEARANCE_NAVIGATION",
        to: "/appearance/navigation",
        icon: Navigation2,
      },
      {
        key: "appearance.styles",
        label: "Global styles",
        labelKey: "common:NAV_APPEARANCE_STYLES",
        to: "/appearance/styles",
        icon: Palette,
      },
    ],
  },
  {
    key: "plugins",
    label: "Plugins",
    labelKey: "common:NAV_PLUGINS",
    icon: Package,
    children: [
      {
        key: "plugins.installed",
        label: "Installed",
        labelKey: "common:NAV_PLUGINS_INSTALLED",
        to: "/plugins/installed",
        icon: Package,
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    labelKey: "common:NAV_SETTINGS",
    icon: Settings,
    children: [
      {
        key: "settings.general",
        label: "General",
        labelKey: "common:NAV_SETTINGS_GENERAL",
        to: "/settings/general",
        icon: SlidersHorizontal,
      },
      {
        key: "settings.seo",
        label: "SEO",
        labelKey: "common:NAV_SETTINGS_SEO",
        to: "/settings/seo",
        icon: Search,
      },
      {
        key: "settings.team",
        label: "Team",
        labelKey: "common:NAV_SETTINGS_TEAM",
        icon: Users,
        children: [
          {
            key: "settings.team.members",
            label: "Member invitations",
            labelKey: "common:NAV_SETTINGS_TEAM_MEMBERS",
            to: "/settings/team/members",
            icon: UserPlus,
          },
          {
            key: "settings.team.roles",
            label: "Roles & permissions",
            labelKey: "common:NAV_SETTINGS_TEAM_ROLES",
            to: "/settings/team/roles",
            icon: ShieldCheck,
          },
        ],
      },
      {
        key: "settings.maintenance",
        label: "Maintenance",
        labelKey: "common:NAV_SETTINGS_MAINTENANCE",
        icon: Wrench,
        children: [
          {
            key: "settings.maintenance.snapshots",
            label: "Backups & rollback",
            labelKey: "common:NAV_SETTINGS_MAINTENANCE_SNAPSHOTS",
            to: "/settings/maintenance/snapshots",
            icon: HardDrive,
          },
          {
            key: "settings.maintenance.auditLog",
            label: "Audit log",
            labelKey: "common:NAV_SETTINGS_MAINTENANCE_AUDIT_LOG",
            to: "/settings/maintenance/audit-log",
            icon: History,
          },
          {
            key: "settings.maintenance.status",
            label: "System status",
            labelKey: "common:NAV_SETTINGS_MAINTENANCE_STATUS",
            to: "/settings/maintenance/status",
            icon: Activity,
          },
        ],
      },
    ],
  },
] as const;
