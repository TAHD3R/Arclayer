import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentLibraryPage } from "@/pages/projects/content/library/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/library/")({
  component: ProjectContentLibraryRouteComponent,
});

function ProjectContentLibraryRouteComponent() {
  const { projectId } = Route.useParams();
  return (
    <ContentLibraryPage
      projectId={projectId}
      routeBase="/projects/$projectId/content/library/"
      search={Route.useSearch()}
    />
  );
}
