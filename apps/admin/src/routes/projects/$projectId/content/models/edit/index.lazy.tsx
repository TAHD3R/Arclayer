import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentModelEditPage } from "@/pages/projects/content/models/edit-page";

export const Route = createLazyFileRoute("/projects/$projectId/content/models/edit/")({
  component: ProjectContentModelsEditRouteComponent,
});

function ProjectContentModelsEditRouteComponent() {
  const { projectId } = Route.useParams();
  const { modelId, section } = Route.useSearch();
  return <ContentModelEditPage projectId={projectId} modelId={modelId} section={section} />;
}
