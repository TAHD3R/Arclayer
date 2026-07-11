import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/domain/")({
  staticData: { titleKey: "nav:NAV_WEBSITE_DOMAIN" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/website/project-releases",
      params: { projectId: params.projectId },
      replace: true,
    });
  },
});
