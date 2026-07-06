import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralLocalizationSettingsPage } from "@/pages/projects/settings/site/localization/page";

export const Route = createLazyFileRoute("/projects/$projectId/seo/site/localization/")({
  component: ProjectSeoSiteLocalizationRouteComponent,
});

function ProjectSeoSiteLocalizationRouteComponent() {
  const { projectId } = Route.useParams();
  return <GeneralLocalizationSettingsPage projectId={projectId} />;
}
