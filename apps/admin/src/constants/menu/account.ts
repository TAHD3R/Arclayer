import { Bell, CircleAlert, CreditCard, Monitor, Shield, UserRound, Waves } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

export const ACCOUNT_NAV_ITEMS: AdminNavItem[] = [
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
        to: "/account/profile",
        icon: UserRound,
      },
      {
        key: "account.appearance",
        label: "Appearance",
        labelKey: "account:ACCOUNT_NAV_APPEARANCE",
        to: "/account/appearance",
        icon: Monitor,
      },
      {
        key: "account.security",
        label: "Security",
        labelKey: "account:ACCOUNT_NAV_SECURITY",
        to: "/account/security",
        icon: Shield,
      },
      {
        key: "account.notifications",
        label: "Notifications",
        labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
        to: "/account/notifications",
        icon: Bell,
      },
    ],
  },
  {
    key: "account.account",
    label: "Account",
    labelKey: "account:ACCOUNT_SECTION_ACCOUNT",
    icon: CreditCard,
    children: [
      {
        key: "account.billing",
        label: "Billing",
        labelKey: "account:ACCOUNT_NAV_BILLING",
        to: "/account/billing",
        icon: CreditCard,
      },
      {
        key: "account.usage",
        label: "Usage",
        labelKey: "account:ACCOUNT_NAV_USAGE",
        to: "/account/usage",
        icon: Waves,
      },
      {
        key: "account.danger",
        label: "Danger Zone",
        labelKey: "account:ACCOUNT_NAV_DANGER",
        to: "/account/danger",
        icon: CircleAlert,
      },
    ],
  },
] as const;
