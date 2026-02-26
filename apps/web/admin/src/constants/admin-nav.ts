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
  Puzzle,
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
  /**
   * When true, the item is rendered but should not be navigable (UI will show a blocked/disabled state).
   *
   * Notes:
   * - This is a UI hint; backend APIs must still enforce permissions.
   * - Workspace route guard should NOT treat disabled items as allowed.
   */
  disabled?: boolean;
  blockedReason?: "missing_permission" | "plugin_disabled" | null;
  requiredPermission?: string | null;
  ownerPluginId?: string | null;
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
        key: "appearance.styles",
        label: "Global styles",
        labelKey: "nav:NAV_APPEARANCE_STYLES",
        to: "/appearance/styles",
        icon: Palette,
      },
    ],
  },
  {
    key: "extensions",
    label: "Extensions",
    labelKey: "nav:NAV_EXTENSIONS",
    to: "/extensions",
    icon: Puzzle,
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
        to: "/team/roles",
        icon: ShieldCheck,
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
            key: "settings.maintenance.activity",
            label: "Activity",
            labelKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
            to: "/settings/maintenance/activity",
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
