import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/general/")({
  staticData: { titleKey: "nav:NAV_WEBSITE_CONFIG" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/seo/site",
      params,
      replace: true,
    });
  },
});
