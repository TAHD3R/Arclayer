import type { ReactNode } from "react";

import { UserAppearanceView } from "@/pages/usercenter/appearance/components/user-appearance-view";
import { UserCenterBillingContent } from "@/pages/usercenter/billing/page";
import { UserCenterDangerContent } from "@/pages/usercenter/danger/page";
import { UserNotificationSettingsView } from "@/pages/usercenter/notifications/components/user-notification-settings-view";
import { UserProfileView } from "@/pages/usercenter/profile/components/user-profile-view";
import { UserSecurityView } from "@/pages/usercenter/security/components/user-security-view";
import { UserCenterUsageContent } from "@/pages/usercenter/usage/page";
import type { UsercenterOverlayTab } from "@/lib/routing/usercenter-overlay";

export type UsercenterOverlayItem = {
  tab: UsercenterOverlayTab;
  to: string;
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  render: () => ReactNode;
};

export const USERCENTER_OVERLAY_ITEMS: readonly UsercenterOverlayItem[] = [
  {
    tab: "profile",
    to: "/usercenter/profile",
    labelKey: "account:ACCOUNT_NAV_PROFILE",
    titleKey: "account:ME_TAB_PROFILE",
    descriptionKey: "account:ME_TAB_PROFILE_DESC",
    render: () => <UserProfileView mode="dialog" includeDanger={false} />,
  },
  {
    tab: "appearance",
    to: "/usercenter/appearance",
    labelKey: "account:ACCOUNT_NAV_APPEARANCE",
    titleKey: "account:ME_TAB_PREFERENCES",
    descriptionKey: "account:ME_TAB_PREFERENCES_DESC",
    render: () => <UserAppearanceView mode="dialog" />,
  },
  {
    tab: "security",
    to: "/usercenter/security",
    labelKey: "account:ACCOUNT_NAV_SECURITY",
    titleKey: "account:ME_TAB_SECURITY",
    descriptionKey: "account:ME_TAB_SECURITY_DESC",
    render: () => <UserSecurityView mode="dialog" />,
  },
  {
    tab: "notifications",
    to: "/usercenter/notifications",
    labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
    titleKey: "account:ME_TAB_NOTIFICATIONS",
    descriptionKey: "account:ME_TAB_NOTIFICATIONS_DESC",
    render: () => <UserNotificationSettingsView mode="dialog" />,
  },
  {
    tab: "billing",
    to: "/usercenter/billing",
    labelKey: "account:ACCOUNT_NAV_BILLING",
    titleKey: "account:ACCOUNT_PAGE_BILLING_TITLE",
    descriptionKey: "account:ACCOUNT_PAGE_BILLING_DESC",
    render: () => <UserCenterBillingContent />,
  },
  {
    tab: "usage",
    to: "/usercenter/usage",
    labelKey: "account:ACCOUNT_NAV_USAGE",
    titleKey: "account:ACCOUNT_PAGE_USAGE_TITLE",
    descriptionKey: "account:ACCOUNT_PAGE_USAGE_DESC",
    render: () => <UserCenterUsageContent />,
  },
  {
    tab: "danger",
    to: "/usercenter/danger",
    labelKey: "account:ACCOUNT_NAV_DANGER",
    titleKey: "account:ACCOUNT_PAGE_DANGER_TITLE",
    descriptionKey: "account:ACCOUNT_PAGE_DANGER_DESC",
    render: () => <UserCenterDangerContent />,
  },
] as const;

export function getUsercenterOverlayItem(tab: UsercenterOverlayTab): UsercenterOverlayItem {
  const item = USERCENTER_OVERLAY_ITEMS.find((candidate) => candidate.tab === tab);
  if (!item) {
    throw new Error(`Unknown usercenter overlay tab: ${tab}`);
  }
  return item;
}

export function getUsercenterOverlayTitleKey(tab: UsercenterOverlayTab): string {
  return getUsercenterOverlayItem(tab).titleKey;
}
