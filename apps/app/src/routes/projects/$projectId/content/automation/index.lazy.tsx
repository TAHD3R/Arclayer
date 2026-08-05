import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentAutomationPage } from "@/pages/projects/content/automation/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/automation/")({
  component: ProjectContentAutomationRouteComponent,
});

function ProjectContentAutomationRouteComponent() {
  const { projectId } = Route.useParams();
  return <ContentAutomationPage projectId={projectId} />;
}
