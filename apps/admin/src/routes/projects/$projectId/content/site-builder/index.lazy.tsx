import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentSiteBuilderPage } from "@/pages/workspaces/content/site-builder/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createLazyFileRoute("/projects/$projectId/content/site-builder/")({
  component: ProjectContentSiteBuilderRouteComponent,
});

function ProjectContentSiteBuilderRouteComponent() {
  const { projectId } = Route.useParams();
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  return <ContentSiteBuilderPage workspaceId={workspaceId ?? projectId} />;
}
