import {
  BookOpenText,
  Boxes,
  ChartNoAxesCombined,
  FolderOpen,
  Globe2,
  History,
  LayoutDashboard,
  LibraryBig,
  MonitorCog,
  PanelsTopLeft,
  ScanSearch,
  SearchCheck,
  Settings2,
} from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

const BASE_PROJECT_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Overview",
    labelKey: "nav:NAV_DASHBOARD",
    to: "/",
    icon: LayoutDashboard,
  },
  {
    key: "editor",
    label: "Editor",
    labelKey: "nav:NAV_PROJECT_EDITOR",
    to: "/editor",
    icon: PanelsTopLeft,
    insertStarredAfter: true,
  },
  {
    key: "assets",
    label: "Assets",
    labelKey: "nav:NAV_ASSETS",
    to: "/assets",
    icon: FolderOpen,
    groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
  },
  {
    key: "website.domains",
    label: "Domains",
    labelKey: "nav:NAV_WEBSITE_DOMAINS",
    to: "/website/project-releases",
    icon: Globe2,
  },
  {
    key: "content",
    label: "Content",
    labelKey: "nav:NAV_CONTENT",
    icon: BookOpenText,
    defaultExpanded: true,
    children: [
      {
        key: "content.library",
        label: "Content Library",
        labelKey: "nav:NAV_CONTENT_LIBRARY",
        to: "/content/library",
        icon: LibraryBig,
      },
      {
        key: "content.models",
        label: "Content Models",
        labelKey: "nav:NAV_CONTENT_MODELS",
        to: "/content/models",
        icon: Boxes,
      },
    ],
  },
  {
    key: "seo",
    label: "SEO",
    labelKey: "nav:NAV_SECTION_SEO",
    icon: ScanSearch,
    defaultExpanded: true,
    children: [
      {
        key: "seo.google-analytics",
        label: "Google Analytics",
        labelKey: "nav:NAV_GOOGLE_ANALYTICS",
        to: "/seo/google-analytics",
        icon: ChartNoAxesCombined,
      },
      {
        key: "seo.audit",
        label: "SEO Analysis",
        labelKey: "nav:NAV_SEO_ANALYSIS",
        to: "/seo/audit",
        icon: SearchCheck,
      },
    ],
  },
  {
    key: "website.config",
    label: "Website Config",
    labelKey: "nav:NAV_WEBSITE_CONFIG",
    to: "/website/config",
    icon: MonitorCog,
  },
  {
    key: "activity",
    label: "Activity",
    labelKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY",
    to: "/activity",
    icon: History,
    groupLabelBeforeKey: "nav:NAV_SECTION_PROJECT",
  },
  {
    key: "settings.project",
    label: "Project Settings",
    labelKey: "nav:NAV_SETTINGS_PROJECT",
    to: "/settings/general",
    activeMatchPaths: ["/settings/api", "/settings/environments", "/settings/databases"],
    icon: Settings2,
  },
] as const;

export function getProjectNavItems(): AdminNavItem[] {
  return BASE_PROJECT_NAV_ITEMS;
}

export const PROJECT_NAV_ITEMS: AdminNavItem[] = getProjectNavItems();
export const ADMIN_NAV_ITEMS: AdminNavItem[] = PROJECT_NAV_ITEMS;
