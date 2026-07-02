import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsDomainsPage } from "@/pages/system/domains/page";

export const Route = createFileRoute("/system/settings/domains/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DOMAINS_PAGE_TITLE" },
  component: SystemSettingsDomainsPage,
});
