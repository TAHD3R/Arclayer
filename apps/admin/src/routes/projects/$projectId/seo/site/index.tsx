import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/seo/site/")({
  staticData: { titleKey: "nav:NAV_WEBSITE_CONFIG" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/website/config",
      params,
      replace: true,
    });
  },
});
