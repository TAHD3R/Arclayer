import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/site-builder/")({
  staticData: { titleKey: "nav:NAV_CONTENT_SITE_BUILDER" },
});
