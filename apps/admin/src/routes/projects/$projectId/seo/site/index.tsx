import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/seo/site/")({
  staticData: { titleKey: "nav:NAV_WEBSITE_CONFIG" },
});
