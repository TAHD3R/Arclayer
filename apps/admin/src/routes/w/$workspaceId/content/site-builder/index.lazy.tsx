import { createLazyFileRoute } from "@tanstack/react-router";

import { ContentSiteBuilderPage } from "@/pages/workspaces/content/site-builder/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/site-builder/")({
  component: SiteBuilderRouteComponent,
});

function SiteBuilderRouteComponent() {
  const { workspaceId } = Route.useParams();
  return <ContentSiteBuilderPage workspaceId={workspaceId} />;
}
