import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/website/releases/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/website/project-releases",
      params,
      replace: true,
    });
  },
});
