import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectReleasesPage } from "@/pages/projects/releases/page";

export const Route = createLazyFileRoute("/projects/$projectId/website/releases/")({
  component: ProjectWebsiteReleasesRouteComponent,
});

function ProjectWebsiteReleasesRouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectReleasesPage projectId={projectId} />;
}
