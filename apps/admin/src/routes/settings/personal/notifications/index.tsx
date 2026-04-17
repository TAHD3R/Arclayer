import { createFileRoute } from "@tanstack/react-router";

import { UserCenterNotificationsPage } from "@/pages/usercenter/notifications/page";

export const Route = createFileRoute("/settings/personal/notifications/")({
  staticData: { titleKey: "account:ME_TAB_NOTIFICATIONS" },
  component: UserCenterNotificationsPage,
});
