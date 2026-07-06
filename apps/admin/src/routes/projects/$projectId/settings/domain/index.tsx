import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/domain/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_DOMAIN" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/website/domain",
      params,
      replace: true,
    });
  },
});
