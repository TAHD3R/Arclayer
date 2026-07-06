import { createFileRoute } from "@tanstack/react-router";

import { ProjectSeoAnalysisPage } from "@/pages/projects/seo/analysis-page";

export const Route = createFileRoute("/projects/$projectId/seo/audit/")({
  staticData: { titleKey: "nav:NAV_SEO_ANALYSIS" },
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectSeoAnalysisPage projectId={projectId} />;
}
