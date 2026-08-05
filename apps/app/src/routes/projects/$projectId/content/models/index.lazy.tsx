import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentModelsControlCenterPage } from "@/pages/projects/content/models/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/models/")({
  component: ProjectContentModelsRouteComponent,
});

function ProjectContentModelsRouteComponent() {
  const { projectId } = Route.useParams();
  return <ContentModelsControlCenterPage projectId={projectId} />;
}
