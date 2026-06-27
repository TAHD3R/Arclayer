import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsAgentsPage } from "@/pages/system/agents/page";

export const Route = createFileRoute("/system/settings/agents/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_AGENTS_PAGE_TITLE" },
  component: SystemSettingsAgentsPage,
});
