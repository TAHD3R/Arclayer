import { createFileRoute } from "@tanstack/react-router";

import { ProjectGoogleAnalyticsPage } from "@/pages/projects/seo/page";

export const Route = createFileRoute("/projects/$projectId/seo/google-analytics/")({
  staticData: { titleKey: "nav:NAV_GOOGLE_ANALYTICS" },
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectGoogleAnalyticsPage projectId={projectId} />;
}
