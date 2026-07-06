import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralSiteSettingsPage } from "@/pages/projects/settings/site/basics/page";

export const Route = createLazyFileRoute("/projects/$projectId/seo/site/")({
  component: ProjectSeoSiteRouteComponent,
});

function ProjectSeoSiteRouteComponent() {
  const { projectId } = Route.useParams();
  return <GeneralSiteSettingsPage projectId={projectId} />;
}
