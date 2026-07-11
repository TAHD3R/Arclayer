import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/deployments/")({
  staticData: { titleKey: "account:SETTINGS_PROJECT_DEPLOYMENTS_TITLE" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/website/project-releases",
      params,
      replace: true,
    });
  },
});
