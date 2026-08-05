import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentSiteBuilderPage } from "@/pages/projects/content/site-builder/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/site-builder/")({
  component: ProjectContentSiteBuilderRouteComponent,
});

function ProjectContentSiteBuilderRouteComponent() {
  const { projectId } = Route.useParams();
  return <ContentSiteBuilderPage projectId={projectId} />;
}
