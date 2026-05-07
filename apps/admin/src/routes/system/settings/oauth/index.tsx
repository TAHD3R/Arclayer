import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsOAuthPage } from "@/pages/system/oauth/page";

export const Route = createFileRoute("/system/settings/oauth/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_OAUTH_PAGE_TITLE" },
  component: SystemSettingsOAuthPage,
});
