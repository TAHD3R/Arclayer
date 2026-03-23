import { Bell, CircleAlert, CreditCard, Monitor, Shield, UserRound, Waves } from "lucide-react";

import type { AdminNavSection } from "@/types/admin-nav";

export const ACCOUNT_NAV_SECTIONS: AdminNavSection[] = [
  {
    key: "personal",
    title: "Personal",
    titleKey: "account:ACCOUNT_SECTION_PERSONAL",
    items: [
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
    key: "account",
    title: "Account",
    titleKey: "account:ACCOUNT_SECTION_ACCOUNT",
    items: [
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
