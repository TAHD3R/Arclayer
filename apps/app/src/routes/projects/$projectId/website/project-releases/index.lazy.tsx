import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectDomainsPage } from "@/pages/projects/project-releases/page";

export const Route = createLazyFileRoute("/projects/$projectId/website/project-releases/")({
  component: ProjectDomainsRouteComponent,
});

function ProjectDomainsRouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectDomainsPage projectId={projectId} />;
}
