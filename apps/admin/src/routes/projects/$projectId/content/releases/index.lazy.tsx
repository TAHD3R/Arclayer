import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentReleaseCenterPage } from "@/pages/projects/content/releases/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/releases/")({
  component: ProjectContentReleasesRouteComponent,
});

function ProjectContentReleasesRouteComponent() {
  const { projectId } = Route.useParams();
  return <ContentReleaseCenterPage projectId={projectId} />;
}
