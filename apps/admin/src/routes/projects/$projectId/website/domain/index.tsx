import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/website/domain/")({
  staticData: { titleKey: "nav:NAV_WEBSITE_DOMAIN" },
});
