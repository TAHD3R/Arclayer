import { Bell, Monitor, UserRound } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

export const USER_CENTER_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "account.personal",
    label: "Personal",
    labelKey: "account:ACCOUNT_SECTION_PERSONAL",
    icon: UserRound,
    children: [
      {
        key: "account.profile",
        label: "Profile",
        labelKey: "account:ACCOUNT_NAV_PROFILE",
        to: "/usercenter/profile",
        icon: UserRound,
      },
      {
        key: "account.appearance",
        label: "Preferences",
        labelKey: "account:ACCOUNT_NAV_APPEARANCE",
        to: "/usercenter/preferences",
        icon: Monitor,
      },
      {
        key: "account.notifications",
        label: "Notifications",
        labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
        to: "/usercenter/notifications",
        icon: Bell,
      },
    ],
  },
] as const;
