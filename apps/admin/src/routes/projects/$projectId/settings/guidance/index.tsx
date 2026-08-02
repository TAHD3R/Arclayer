import { createFileRoute } from "@tanstack/react-router";

import { ProjectGuidanceSettingsPage } from "@/pages/projects/settings/guidance/page";

export const Route = createFileRoute("/projects/$projectId/settings/guidance/")({
  staticData: { titleKey: "knowledge:PROJECT_SETTINGS_TITLE" },
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectGuidanceSettingsPage projectId={projectId} />;
}
