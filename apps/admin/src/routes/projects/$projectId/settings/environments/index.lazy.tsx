import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectEnvironmentsSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createLazyFileRoute("/projects/$projectId/settings/environments/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectEnvironmentsSettingsPage projectId={projectId} />;
}
