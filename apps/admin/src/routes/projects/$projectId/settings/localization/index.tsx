import { createFileRoute } from "@tanstack/react-router";

import { ProjectLocalizationSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/localization/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_LOCALIZATION" },
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectLocalizationSettingsPage projectId={projectId} />;
}
