import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/library/$itemId/")({
  staticData: { titleKey: "nav:NAV_CONTENT_LIBRARY" },
});
