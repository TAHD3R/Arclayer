import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentLibraryItemResolverPage } from "@/pages/workspaces/content/library/item-resolver/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createLazyFileRoute("/projects/$projectId/content/library/$itemId/")({
  component: ProjectContentLibraryItemResolverRoute,
});

function ProjectContentLibraryItemResolverRoute() {
  const { projectId, itemId } = Route.useParams();
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;

  return <ContentLibraryItemResolverPage workspaceId={workspaceId ?? projectId} itemId={itemId} />;
}
