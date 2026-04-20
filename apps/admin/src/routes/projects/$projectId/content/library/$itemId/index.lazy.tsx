import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentLibraryItemResolverPage } from "@/pages/projects/content/library/item-resolver/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/library/$itemId/")({
  component: ProjectContentLibraryItemResolverRoute,
});

function ProjectContentLibraryItemResolverRoute() {
  const { projectId, itemId } = Route.useParams();
  return <ContentLibraryItemResolverPage projectId={projectId} itemId={itemId} />;
}
