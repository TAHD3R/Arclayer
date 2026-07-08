import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/website/config/")({
  staticData: { titleKey: "nav:NAV_WEBSITE_CONFIG" },
});
