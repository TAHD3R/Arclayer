import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsOverviewPage } from "@/pages/system/overview/page";

export const Route = createFileRoute("/system/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_OVERVIEW_TITLE" },
  component: SystemSettingsOverviewPage,
});
