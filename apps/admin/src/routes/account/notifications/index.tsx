import { createFileRoute } from "@tanstack/react-router";

import { AccountNotificationsPage } from "@/pages/account/notifications/page";

export const Route = createFileRoute("/account/notifications/")({
  staticData: { titleKey: "account:ME_TAB_NOTIFICATIONS" },
  component: AccountNotificationsPage,
});
