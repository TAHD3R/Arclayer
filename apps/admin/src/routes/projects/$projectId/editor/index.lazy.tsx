import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectEditorPage } from "@/pages/projects/editor/page";
import { parseProjectEditorTarget } from "@/pages/projects/editor/editor-deep-link";

export const Route = createLazyFileRoute("/projects/$projectId/editor/")({
  component: ProjectEditorRouteComponent,
});

function ProjectEditorRouteComponent() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <ProjectEditorPage
      projectId={projectId}
      initialStage={search.stage}
      initialPageId={search.page ?? null}
      initialTargets={(search.target ?? []).flatMap((value) => {
        const target = parseProjectEditorTarget(value);
        return target ? [target] : [];
      })}
    />
  );
}
