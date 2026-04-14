import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsActivityPage } from "@/pages/system/activity/page";

export const Route = createFileRoute("/system/activity/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_ACTIVITY_PAGE_TITLE" },
  component: SystemSettingsActivityPage,
});
