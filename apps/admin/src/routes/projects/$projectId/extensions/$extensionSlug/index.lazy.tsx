import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceExtensionDetailPage } from "@/pages/workspaces/extensions/detail/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createLazyFileRoute("/projects/$projectId/extensions/$extensionSlug/")({
  component: ProjectExtensionDetailRouteComponent,
});

function ProjectExtensionDetailRouteComponent() {
  const { projectId, extensionSlug } = Route.useParams();
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;

  return (
    <WorkspaceExtensionDetailPage
      workspaceId={workspaceId ?? projectId}
      extensionSlug={extensionSlug}
      backTo={`/projects/${projectId}/extensions`}
    />
  );
}
