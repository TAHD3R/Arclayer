import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/localization/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/content/localization",
      params,
      replace: true,
    });
  },
});
