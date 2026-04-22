import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralLocalizationSettingsPage } from "@/pages/projects/settings/site/localization/page";

export const Route = createLazyFileRoute("/projects/$projectId/content/localization/")({
  component: ProjectContentLocalizationRouteComponent,
});

function ProjectContentLocalizationRouteComponent() {
  const { projectId } = Route.useParams();
  return <GeneralLocalizationSettingsPage projectId={projectId} />;
}
