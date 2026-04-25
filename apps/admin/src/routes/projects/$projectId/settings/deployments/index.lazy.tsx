import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectDeploymentsSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createLazyFileRoute("/projects/$projectId/settings/deployments/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectDeploymentsSettingsPage projectId={projectId} />;
}
