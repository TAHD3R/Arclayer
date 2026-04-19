import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/releases/")({
  staticData: { titleKey: "nav:NAV_CONTENT_RELEASES" },
});
