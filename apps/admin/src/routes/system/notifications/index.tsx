import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsNotificationsPage } from "@/pages/system/notifications/page";

export const Route = createFileRoute("/system/notifications/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_PAGE_TITLE" },
  component: SystemSettingsNotificationsPage,
});
