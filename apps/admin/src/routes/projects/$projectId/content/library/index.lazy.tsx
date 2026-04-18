import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentLibraryPage } from "@/pages/workspaces/content/library/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/library/")({
  component: ProjectContentLibraryRouteComponent,
});

function ProjectContentLibraryRouteComponent() {
  return (
    <ContentLibraryPage
      routeBase="/projects/$projectId/content/library/"
      search={Route.useSearch()}
    />
  );
}
