import { createFileRoute } from "@tanstack/react-router";

import { ProjectSeoSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/seo/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_SEO" },
  component: ProjectSeoSettingsPage,
});
