import { createFileRoute } from "@tanstack/react-router";

import { ProjectMembersSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/members/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_MEMBERS" },
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectMembersSettingsPage projectId={projectId} />;
}
