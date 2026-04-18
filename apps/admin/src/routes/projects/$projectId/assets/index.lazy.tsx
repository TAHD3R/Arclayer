import { createLazyFileRoute } from "@tanstack/react-router";

import { AssetsPage } from "@/pages/workspaces/assets/page";

export const Route = createLazyFileRoute("/projects/$projectId/assets/")({
  component: ProjectAssetsRouteComponent,
});

function ProjectAssetsRouteComponent() {
  const search = Route.useSearch();
  return <AssetsPage initialSearchQuery={search.q} initialAssetId={search.assetId} />;
}
