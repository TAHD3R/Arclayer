import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectDomainSettingsPage } from "@/pages/projects/settings/domain/page";

export const Route = createLazyFileRoute("/projects/$projectId/website/domain/")({
  component: ProjectWebsiteDomainRouteComponent,
});

function ProjectWebsiteDomainRouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectDomainSettingsPage projectId={projectId} />;
}
