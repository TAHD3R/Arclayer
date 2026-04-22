import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/domain/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/content/domain",
      params,
      replace: true,
    });
  },
});
