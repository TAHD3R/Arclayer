import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentModelsControlCenterPage } from "@/pages/workspaces/content/models/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createLazyFileRoute("/projects/$projectId/content/models/")({
  component: ProjectContentModelsRouteComponent,
});

function ProjectContentModelsRouteComponent() {
  const { projectId } = Route.useParams();
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  return <ContentModelsControlCenterPage workspaceId={workspaceId ?? projectId} />;
}
