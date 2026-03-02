import { Bell, CircleHelp, ExternalLink } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

/**
 * Footer nav items shared across all nav contexts (workspace, org, me).
 * Keys are stable — admin-layout injects runtime callbacks (e.g. onAction for notifications).
 */
export const COMMON_FOOTER_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "notifications",
    label: "Notifications",
    labelKey: "nav:NAV_NOTIFICATIONS",
    icon: Bell,
    position: "footer",
  },
  {
    key: "help-center",
    label: "Support",
    labelKey: "nav:NAV_HELP_CENTER",
    icon: CircleHelp,
    position: "footer",
    trailingIcon: ExternalLink,
  },
];
