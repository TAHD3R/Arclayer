import { createLazyFileRoute } from "@tanstack/react-router";

import { AssetsPage } from "@/pages/workspaces/assets/page";

export const Route = createLazyFileRoute("/projects/$projectId/assets/")({
  component: ProjectAssetsRouteComponent,
});

function ProjectAssetsRouteComponent() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <AssetsPage
      projectId={projectId}
      initialSearchQuery={search.q}
      initialAssetId={search.assetId}
    />
  );
}
