import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createLazyFileRoute("/projects/$projectId/content/site-builder/")({
  component: ProjectContentSiteBuilderRouteComponent,
});

function ProjectContentSiteBuilderRouteComponent() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: "/projects/$projectId/content/site-builder/" });
  useEffect(() => {
    void navigate({
      to: "/projects/$projectId/editor",
      params: { projectId },
      search: { stage: "sitemap" },
      replace: true,
    });
  }, [navigate, projectId]);
  return null;
}
