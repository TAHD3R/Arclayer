import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentReleaseCenterPage } from "@/pages/workspaces/content/releases/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createLazyFileRoute("/projects/$projectId/content/releases/")({
  component: ProjectContentReleasesRouteComponent,
});

function ProjectContentReleasesRouteComponent() {
  const { projectId } = Route.useParams();
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  return <ContentReleaseCenterPage workspaceId={workspaceId ?? projectId} />;
}
