import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/models/")({
  staticData: { titleKey: "nav:NAV_CONTENT_MODELS" },
});
