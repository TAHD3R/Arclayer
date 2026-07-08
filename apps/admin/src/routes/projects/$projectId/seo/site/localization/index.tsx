import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/seo/site/localization/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_LOCALIZATION" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/website/config",
      params,
      replace: true,
    });
  },
});
