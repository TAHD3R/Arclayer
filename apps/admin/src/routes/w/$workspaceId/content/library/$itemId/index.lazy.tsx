import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentLibraryItemResolverPage } from "@/pages/workspaces/content/library/item-resolver/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/library/$itemId/")({
  component: ContentLibraryItemResolverRoute,
});

function ContentLibraryItemResolverRoute() {
  const { workspaceId, itemId } = Route.useParams();

  return <ContentLibraryItemResolverPage workspaceId={workspaceId} itemId={itemId} />;
}
