import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectDatabasesSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createLazyFileRoute("/projects/$projectId/settings/databases/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectDatabasesSettingsPage projectId={projectId} />;
}
