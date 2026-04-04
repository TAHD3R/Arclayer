import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentModelsControlCenterPage } from "@/pages/workspaces/content/models/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/models/")({
  component: ContentModelsRouteComponent,
});

function ContentModelsRouteComponent() {
  const { workspaceId } = Route.useParams();
  return <ContentModelsControlCenterPage workspaceId={workspaceId} />;
}
