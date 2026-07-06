import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectEditorPage } from "@/pages/projects/editor/page";

export const Route = createLazyFileRoute("/projects/$projectId/editor/")({
  component: ProjectEditorRouteComponent,
});

function ProjectEditorRouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectEditorPage projectId={projectId} />;
}
