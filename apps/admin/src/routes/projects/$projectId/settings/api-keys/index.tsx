import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/api-keys/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/settings/api",
      params,
      replace: true,
    });
  },
});
