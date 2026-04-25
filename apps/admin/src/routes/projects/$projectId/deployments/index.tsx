import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/deployments/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/settings/deployments",
      params,
      replace: true,
    });
  },
});
