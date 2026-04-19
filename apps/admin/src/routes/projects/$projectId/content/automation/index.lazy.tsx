import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentAutomationPage } from "@/pages/workspaces/content/automation/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createLazyFileRoute("/projects/$projectId/content/automation/")({
  component: ProjectContentAutomationRouteComponent,
});

function ProjectContentAutomationRouteComponent() {
  const { projectId } = Route.useParams();
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  return <ContentAutomationPage workspaceId={workspaceId ?? projectId} />;
}
