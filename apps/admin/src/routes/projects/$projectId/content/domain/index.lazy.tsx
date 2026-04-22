import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectDomainSettingsPage } from "@/pages/projects/settings/domain/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/domain/")({
  component: ProjectContentDomainRouteComponent,
});

function ProjectContentDomainRouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectDomainSettingsPage projectId={projectId} />;
}
