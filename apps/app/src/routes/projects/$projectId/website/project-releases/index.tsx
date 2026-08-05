import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/website/project-releases/")({
  staticData: { titleKey: "nav:NAV_WEBSITE_DOMAINS" },
});
