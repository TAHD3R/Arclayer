import { createFileRoute } from "@tanstack/react-router";

import { SystemPluginsPage } from "@/pages/system/plugins/page";

export const Route = createFileRoute("/system/plugins/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_PLUGINS_PAGE_TITLE" },
  component: SystemPluginsPage,
});
