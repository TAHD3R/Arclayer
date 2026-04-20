import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceExtensionDetailPage } from "@/pages/projects/extensions/detail/page";

export const Route = createLazyFileRoute("/projects/$projectId/extensions/$extensionSlug/")({
  component: ProjectExtensionDetailRouteComponent,
});

function ProjectExtensionDetailRouteComponent() {
  const { projectId, extensionSlug } = Route.useParams();
  return (
    <WorkspaceExtensionDetailPage
      projectId={projectId}
      extensionSlug={extensionSlug}
      backTo={`/projects/${projectId}/extensions`}
    />
  );
}
