import { createFileRoute } from "@tanstack/react-router";

import { ProjectDomainSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/domain/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_DOMAIN" },
  component: ProjectDomainSettingsPage,
});
