import type { ReactNode } from "react";

import { UserAppearanceView } from "@/pages/usercenter/appearance/components/user-appearance-view";
import { UserNotificationSettingsView } from "@/pages/usercenter/notifications/components/user-notification-settings-view";
import { UserProfileView } from "@/pages/usercenter/profile/components/user-profile-view";
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
    render: () => <UserProfileView mode="dialog" />,
  },
  {
    tab: "preferences",
    to: "/usercenter/preferences",
    labelKey: "account:ACCOUNT_NAV_APPEARANCE",
    titleKey: "account:ME_TAB_PREFERENCES",
    descriptionKey: "account:ME_TAB_PREFERENCES_DESC",
    render: () => <UserAppearanceView mode="dialog" />,
  },
  {
    tab: "notifications",
    to: "/usercenter/notifications",
    labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
    titleKey: "account:ME_TAB_NOTIFICATIONS",
    descriptionKey: "account:ME_TAB_NOTIFICATIONS_DESC",
    render: () => <UserNotificationSettingsView mode="dialog" />,
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
