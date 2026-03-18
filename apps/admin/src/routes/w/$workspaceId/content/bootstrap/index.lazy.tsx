import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentBootstrapPage } from "@/pages/workspaces/content/bootstrap/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/bootstrap/")({
  component: BootstrapRouteComponent,
});

function BootstrapRouteComponent() {
  const { workspaceId } = Route.useParams();
  return <ContentBootstrapPage workspaceId={workspaceId} />;
}
