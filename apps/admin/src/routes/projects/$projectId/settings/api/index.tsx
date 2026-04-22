import { createFileRoute } from "@tanstack/react-router";

import { ProjectApiKeysSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/api/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_API" },
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectApiKeysSettingsPage projectId={projectId} />;
}
