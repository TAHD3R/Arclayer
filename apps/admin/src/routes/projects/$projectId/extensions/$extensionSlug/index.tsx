import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/extensions/$extensionSlug/")({
  staticData: { titleKey: "nav:NAV_EXTENSIONS" },
});
