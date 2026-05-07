import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsAccessPage } from "@/pages/system/access/page";

export const Route = createFileRoute("/system/settings/access/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_ACCESS_PAGE_TITLE" },
  component: SystemSettingsAccessPage,
});
