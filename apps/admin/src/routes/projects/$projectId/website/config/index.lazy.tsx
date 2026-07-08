import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralSettingsPage } from "@/pages/projects/settings/site/page";

export const Route = createLazyFileRoute("/projects/$projectId/website/config/")({
  component: ProjectWebsiteConfigRouteComponent,
});

function ProjectWebsiteConfigRouteComponent() {
  const { projectId } = Route.useParams();
  return <GeneralSettingsPage projectId={projectId} />;
}
