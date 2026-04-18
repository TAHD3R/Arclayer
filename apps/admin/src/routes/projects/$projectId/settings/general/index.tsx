import { createFileRoute } from "@tanstack/react-router";

import { ProjectGeneralSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/general/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_GENERAL" },
  component: RouteComponent,
});

function RouteComponent() {
  return <ProjectGeneralSettingsPage />;
}
